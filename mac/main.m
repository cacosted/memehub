// Memehub.app: la misma web de Memehub en una ventana nativa, servida directo desde la carpeta del repo
// (así los memes nuevos aparecen sin recompilar) y con arrastre de archivos de verdad: lo que arrastras sale
// como si viniera del Finder, así que Resolve, el Finder o Photopea lo reciben como archivo.
// Los pines de Pinterest no están en el disco: la app los baja a descargados/ cuando se lo pides.
// Está en Objective-C porque el Swift de las Command Line Tools no compila contra WebKit (igual que Cacoscript).

#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

#ifndef MEMEHUB_ROOT
#define MEMEHUB_ROOT "~/Documents/game-vids/memes-web"
#endif

static NSString *const kScheme = @"memehub";
static NSString *const kDownloadsDir = @"descargados";

static NSString *RootPath(void) {
    NSString *custom = [[NSUserDefaults standardUserDefaults] stringForKey:@"MemehubRoot"];
    return (custom.length ? custom : @MEMEHUB_ROOT).stringByExpandingTildeInPath.stringByStandardizingPath;
}

// Ruta relativa de la página → archivo dentro de la carpeta de Memehub (nunca fuera de ella).
static NSString *SafePath(NSString *relative) {
    if (![relative isKindOfClass:[NSString class]] || !relative.length) return nil;
    NSString *root = RootPath();
    NSString *full = [root stringByAppendingPathComponent:relative].stringByStandardizingPath;
    if (![full hasPrefix:[root stringByAppendingString:@"/"]]) return nil;
    if ([full containsString:@"/.git/"] || [full hasSuffix:@"/.git"]) return nil;
    return full;
}

static NSString *MimeFor(NSString *path) {
    NSString *ext = path.pathExtension.lowercaseString;
    NSDictionary *known = @{ @"html": @"text/html; charset=utf-8", @"js": @"text/javascript; charset=utf-8",
                             @"css": @"text/css; charset=utf-8", @"json": @"application/json; charset=utf-8",
                             @"mp3": @"audio/mpeg", @"svg": @"image/svg+xml" };
    if (known[ext]) return known[ext];
    UTType *type = [UTType typeWithFilenameExtension:ext];
    return type.preferredMIMEType ?: @"application/octet-stream";
}

static NSString *Slug(NSString *text) {
    NSString *plain = [text stringByApplyingTransform:NSStringTransformStripDiacritics reverse:NO].lowercaseString ?: @"";
    NSMutableString *out = [NSMutableString string];
    BOOL dash = NO;
    for (NSUInteger i = 0; i < plain.length && out.length < 50; i++) {
        unichar c = [plain characterAtIndex:i];
        if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) { [out appendFormat:@"%C", c]; dash = NO; }
        else if (!dash && out.length) { [out appendString:@"-"]; dash = YES; }
    }
    while ([out hasSuffix:@"-"]) [out deleteCharactersInRange:NSMakeRange(out.length - 1, 1)];
    return out.length ? out : @"pin";
}

// Registro en ~/Library/Logs/Memehub.log (para diagnosticar el arrastre).
static void Log(NSString *format, ...) {
    va_list args;
    va_start(args, format);
    NSString *line = [[NSString alloc] initWithFormat:format arguments:args];
    va_end(args);
    NSString *path = [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Logs/Memehub.log"];
    if (![[NSFileManager defaultManager] fileExistsAtPath:path]) [[NSFileManager defaultManager] createFileAtPath:path contents:nil attributes:nil];
    NSFileHandle *h = [NSFileHandle fileHandleForWritingAtPath:path];
    [h seekToEndOfFile];
    [h writeData:[[NSString stringWithFormat:@"%@ %@\n", [NSDate date], line] dataUsingEncoding:NSUTF8StringEncoding]];
    [h closeFile];
}

#pragma mark - Servidor interno (memehub://app/…)

@interface MemehubSchemeHandler : NSObject <WKURLSchemeHandler>
@property (strong) NSMutableSet<id<WKURLSchemeTask>> *stopped;
@end

@implementation MemehubSchemeHandler

- (instancetype)init { if ((self = [super init])) _stopped = [NSMutableSet set]; return self; }

- (void)webView:(WKWebView *)webView stopURLSchemeTask:(id<WKURLSchemeTask>)task { [self.stopped addObject:task]; }

- (void)reply:(id<WKURLSchemeTask>)task status:(NSInteger)status headers:(NSDictionary *)headers body:(NSData *)body {
    if ([self.stopped containsObject:task]) { [self.stopped removeObject:task]; return; }
    NSMutableDictionary *all = [@{ @"Content-Length": [NSString stringWithFormat:@"%lu", (unsigned long)body.length],
                                   @"Cache-Control": @"no-cache" } mutableCopy];
    [all addEntriesFromDictionary:headers];
    NSHTTPURLResponse *response = [[NSHTTPURLResponse alloc] initWithURL:task.request.URL statusCode:status HTTPVersion:@"HTTP/1.1" headerFields:all];
    [task didReceiveResponse:response];
    if (body.length) [task didReceiveData:body];
    [task didFinish];
}

- (void)json:(id<WKURLSchemeTask>)task object:(id)object {
    NSData *body = [NSJSONSerialization dataWithJSONObject:object options:0 error:nil] ?: [NSData data];
    [self reply:task status:200 headers:@{ @"Content-Type": @"application/json; charset=utf-8" } body:body];
}

- (void)webView:(WKWebView *)webView startURLSchemeTask:(id<WKURLSchemeTask>)task {
    NSURLComponents *parts = [NSURLComponents componentsWithURL:task.request.URL resolvingAgainstBaseURL:NO];
    NSString *path = parts.percentEncodedPath.stringByRemovingPercentEncoding ?: @"/";
    if ([path hasPrefix:@"/"]) path = [path substringFromIndex:1];
    if (!path.length) path = @"index.html";

    if ([path hasPrefix:@"__api/"]) { [self api:[path substringFromIndex:6] parts:parts task:task]; return; }

    NSString *file = SafePath(path);
    BOOL isDir = NO;
    if (!file || ![[NSFileManager defaultManager] fileExistsAtPath:file isDirectory:&isDir] || isDir) {
        [self reply:task status:404 headers:@{ @"Content-Type": @"text/plain" } body:[@"No existe" dataUsingEncoding:NSUTF8StringEncoding]];
        return;
    }
    [self serveFile:file task:task];
}

// Con soporte de Range: el audio y el video lo piden para poder saltar dentro del archivo.
- (void)serveFile:(NSString *)file task:(id<WKURLSchemeTask>)task {
    NSFileHandle *handle = [NSFileHandle fileHandleForReadingAtPath:file];
    unsigned long long size = [[[NSFileManager defaultManager] attributesOfItemAtPath:file error:nil] fileSize];
    NSString *range = [task.request valueForHTTPHeaderField:@"Range"];
    NSMutableDictionary *headers = [@{ @"Content-Type": MimeFor(file), @"Accept-Ranges": @"bytes" } mutableCopy];
    if (range.length && [range hasPrefix:@"bytes="] && size > 0) {
        NSArray *ends = [[range substringFromIndex:6] componentsSeparatedByString:@"-"];
        unsigned long long start = 0, end = size - 1;
        NSString *a = ends.count > 0 ? ends[0] : @"", *b = ends.count > 1 ? ends[1] : @"";
        if (a.length) { start = strtoull(a.UTF8String, NULL, 10); if (b.length) end = strtoull(b.UTF8String, NULL, 10); }
        else if (b.length) { unsigned long long n = strtoull(b.UTF8String, NULL, 10); start = n >= size ? 0 : size - n; }
        if (end >= size) end = size - 1;
        if (start > end) {
            headers[@"Content-Range"] = [NSString stringWithFormat:@"bytes */%llu", size];
            [self reply:task status:416 headers:headers body:[NSData data]];
            return;
        }
        [handle seekToFileOffset:start];
        NSData *chunk = [handle readDataOfLength:(NSUInteger)(end - start + 1)];
        [handle closeFile];
        headers[@"Content-Range"] = [NSString stringWithFormat:@"bytes %llu-%llu/%llu", start, start + chunk.length - 1, size];
        [self reply:task status:206 headers:headers body:chunk];
        return;
    }
    NSData *data = [handle readDataToEndOfFile] ?: [NSData data];
    [handle closeFile];
    [self reply:task status:200 headers:headers body:data];
}

- (NSString *)param:(NSString *)name in:(NSURLComponents *)parts {
    for (NSURLQueryItem *item in parts.queryItems) if ([item.name isEqualToString:name]) return item.value;
    return nil;
}

// Pines ya bajados: descargados/<titulo>-<id>.<ext>
+ (NSDictionary<NSString *, NSString *> *)downloadedPins {
    NSMutableDictionary *found = [NSMutableDictionary dictionary];
    NSString *dir = [RootPath() stringByAppendingPathComponent:kDownloadsDir];
    NSRegularExpression *re = [NSRegularExpression regularExpressionWithPattern:@"-(\\d{5,})\\.[A-Za-z0-9]+$" options:0 error:nil];
    for (NSString *name in [[NSFileManager defaultManager] contentsOfDirectoryAtPath:dir error:nil]) {
        NSTextCheckingResult *m = [re firstMatchInString:name options:0 range:NSMakeRange(0, name.length)];
        if (m) found[[name substringWithRange:[m rangeAtIndex:1]]] = [kDownloadsDir stringByAppendingPathComponent:name];
    }
    return found;
}

- (void)api:(NSString *)name parts:(NSURLComponents *)parts task:(id<WKURLSchemeTask>)task {
    if ([name isEqualToString:@"estado"]) {
        [self json:task object:@{ @"carpeta": RootPath(), @"descargados": [MemehubSchemeHandler downloadedPins] }];
        return;
    }
    if ([name isEqualToString:@"bajar"]) { [self downloadPin:parts task:task]; return; }
    [self reply:task status:404 headers:@{} body:[NSData data]];
}

// Baja la imagen original del pin (o la de 736 px si la original no está) a descargados/.
- (void)downloadPin:(NSURLComponents *)parts task:(id<WKURLSchemeTask>)task {
    NSString *pinId = [self param:@"id" in:parts] ?: @"";
    NSString *img = [self param:@"img" in:parts] ?: @"";
    NSString *title = [self param:@"title" in:parts] ?: @"pin";
    NSRegularExpression *okId = [NSRegularExpression regularExpressionWithPattern:@"^\\d{5,}$" options:0 error:nil];
    NSRegularExpression *okImg = [NSRegularExpression regularExpressionWithPattern:@"^[0-9a-f]{2}/[0-9a-f]{2}/[0-9a-f]{2}/[0-9a-f]+\\.[a-z0-9]+$" options:0 error:nil];
    if (![okId firstMatchInString:pinId options:0 range:NSMakeRange(0, pinId.length)] ||
        ![okImg firstMatchInString:img options:0 range:NSMakeRange(0, img.length)]) {
        [self json:task object:@{ @"ok": @NO, @"error": @"Pin no válido" }];
        return;
    }
    NSString *existing = [MemehubSchemeHandler downloadedPins][pinId];
    if (existing) { [self json:task object:@{ @"ok": @YES, @"path": existing }]; return; }

    NSArray *urls = @[ [@"https://i.pinimg.com/originals/" stringByAppendingString:img],
                       [@"https://i.pinimg.com/736x/" stringByAppendingString:img] ];
    [self fetchFirst:urls index:0 done:^(NSData *data, NSString *mime) {
        dispatch_async(dispatch_get_main_queue(), ^{
            if (!data) { [self json:task object:@{ @"ok": @NO, @"error": @"Pinterest no respondió" }]; return; }
            NSString *ext = [UTType typeWithMIMEType:mime].preferredFilenameExtension ?: img.pathExtension;
            if ([ext isEqualToString:@"jpeg"]) ext = @"jpg";
            NSString *dir = [RootPath() stringByAppendingPathComponent:kDownloadsDir];
            [[NSFileManager defaultManager] createDirectoryAtPath:dir withIntermediateDirectories:YES attributes:nil error:nil];
            NSString *fileName = [NSString stringWithFormat:@"%@-%@.%@", Slug(title), pinId, ext];
            NSError *error = nil;
            if (![data writeToFile:[dir stringByAppendingPathComponent:fileName] options:NSDataWritingAtomic error:&error]) {
                [self json:task object:@{ @"ok": @NO, @"error": error.localizedDescription ?: @"No se pudo guardar" }];
                return;
            }
            [self json:task object:@{ @"ok": @YES, @"path": [kDownloadsDir stringByAppendingPathComponent:fileName] }];
        });
    }];
}

- (void)fetchFirst:(NSArray<NSString *> *)urls index:(NSUInteger)i done:(void (^)(NSData *, NSString *))done {
    if (i >= urls.count) { done(nil, nil); return; }
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:[NSURL URLWithString:urls[i]]];
    request.timeoutInterval = 20;
    [[[NSURLSession sharedSession] dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        NSHTTPURLResponse *http = [response isKindOfClass:[NSHTTPURLResponse class]] ? (NSHTTPURLResponse *)response : nil;
        if (http.statusCode == 200 && data.length > 0 && [http.MIMEType hasPrefix:@"image/"]) done(data, http.MIMEType);
        else [self fetchFirst:urls index:i + 1 done:done];
    }] resume];
}

@end

#pragma mark - App

@interface AppDelegate : NSObject <NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, NSDraggingSource>
@property (strong) NSWindow *window;
@property (strong) WKWebView *webView;
@property (strong) MemehubSchemeHandler *handler;
@property (strong) NSEvent *lastMouseEvent;
@property (strong) id mouseMonitor;
// Arrastre: la página "arma" la tarjeta al apretar el mouse; la app lo empieza al moverse unos píxeles.
@property (copy) NSString *armedPath;
@property (copy) NSString *armedThumb;
@property BOOL armed, waitingForFile, dragging;
@property NSPoint downPoint;
@end

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    [self buildMenu];
    [self buildWindow];
    // El arrastre lo detecta la app (no WebKit): así sale un archivo de verdad, como desde el Finder.
    __weak AppDelegate *weakSelf = self;
    self.mouseMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskLeftMouseDown | NSEventMaskLeftMouseDragged | NSEventMaskLeftMouseUp
                                                              handler:^NSEvent *(NSEvent *event) {
        return [weakSelf handleMouse:event];
    }];
    if (![[NSFileManager defaultManager] fileExistsAtPath:[RootPath() stringByAppendingPathComponent:@"index.html"]]) {
        [self showMessage:@"No encuentro la carpeta de Memehub." detail:RootPath()];
        return;
    }
    [self.webView loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:@"memehub://app/index.html"]]];
}

- (NSEvent *)handleMouse:(NSEvent *)event {
    if (event.window != self.window) return event;
    if (event.type == NSEventTypeLeftMouseDown) {
        self.armed = self.waitingForFile = NO;
        self.armedPath = nil;
        self.downPoint = event.locationInWindow;
        self.lastMouseEvent = event;
        return event;
    }
    if (event.type == NSEventTypeLeftMouseUp) {
        self.armed = self.waitingForFile = NO;
        return event;
    }
    // Arrastrando
    self.lastMouseEvent = event;
    if (self.dragging || !self.armed) return event;
    NSPoint p = event.locationInWindow;
    if (hypot(p.x - self.downPoint.x, p.y - self.downPoint.y) < 5) return event;
    if (self.armedPath.length) { [self startDragWith:event]; return nil; }
    // Pin que todavía no está en el disco: se pide a la página que lo baje y el arrastre sigue al terminar.
    if (!self.waitingForFile) {
        self.waitingForFile = YES;
        [self.webView evaluateJavaScript:@"window.memehubApp && memehubApp._pending()" completionHandler:nil];
    }
    return nil;
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender { return YES; }

- (void)buildWindow {
    WKWebViewConfiguration *config = [[WKWebViewConfiguration alloc] init];
    config.applicationNameForUserAgent = @"MemehubApp/1.0 Safari/605.1.15";
    self.handler = [[MemehubSchemeHandler alloc] init];
    [config setURLSchemeHandler:self.handler forURLScheme:kScheme];
    NSString *bridge =
        @"window.memehubApp = {"
         "  send(msg) { window.webkit.messageHandlers.memehub.postMessage(msg); },"
         "  arm(path, thumb, hooks) { this._hooks = hooks || {}; this.send({ type: 'arm', path: path || '', thumb: thumb || '' }); },"
         "  _pending() { this._hooks.pending && this._hooks.pending(); },"
         "  _started() { this._hooks.started && this._hooks.started(); },"
         "  _ended() { this._noClick = Date.now(); },"
         "  copy(path) { this.send({ type: 'copy', path }); },"
         "  reveal(path) { this.send({ type: 'reveal', path }); },"
         "  status() { return fetch('__api/estado').then((r) => r.json()); },"
         "  download(pin) { return fetch('__api/bajar?' + new URLSearchParams(pin)).then((r) => r.json()); },"
         "};"
         // Tras soltar un arrastre, WebKit recibe el mouseUp: que no cuente como clic (abriría el visor).
         "document.addEventListener('click', (e) => {"
         "  if (Date.now() - (memehubApp._noClick || 0) < 700) { e.stopPropagation(); e.preventDefault(); }"
         "}, true);";
    [config.userContentController addUserScript:[[WKUserScript alloc] initWithSource:bridge injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:YES]];
    [config.userContentController addScriptMessageHandler:self name:@"memehub"];
#ifdef SELFTEST
    // Solo para pruebas: build con -DSELFTEST corre selftest.js de la carpeta y escribe el resultado en stdout.
    NSString *test = [NSString stringWithContentsOfFile:[RootPath() stringByAppendingPathComponent:@"build/selftest.js"] encoding:NSUTF8StringEncoding error:nil];
    if (test) [config.userContentController addUserScript:[[WKUserScript alloc] initWithSource:test injectionTime:WKUserScriptInjectionTimeAtDocumentEnd forMainFrameOnly:YES]];
    [config.userContentController addScriptMessageHandler:self name:@"selftest"];
#endif

    self.webView = [[WKWebView alloc] initWithFrame:NSZeroRect configuration:config];
    self.webView.navigationDelegate = self;
    self.webView.UIDelegate = self;
    [self.webView setValue:@NO forKey:@"drawsBackground"];
    if (@available(macOS 13.3, *)) self.webView.inspectable = YES;

    self.window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 1280, 860)
                                              styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable
                                                backing:NSBackingStoreBuffered defer:NO];
    self.window.title = @"Memehub";
    self.window.minSize = NSMakeSize(560, 420);
    self.window.contentView = self.webView;
    self.window.tabbingMode = NSWindowTabbingModeDisallowed;
    [self.window center];
    [self.window setFrameAutosaveName:@"MemehubMain"];
    [self.window makeKeyAndOrderFront:nil];
}

- (void)showMessage:(NSString *)text detail:(NSString *)detail {
    NSString *html = [NSString stringWithFormat:
        @"<html><head><meta charset='utf-8'><style>:root{color-scheme:light dark}"
         "body{font:15px -apple-system,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:Canvas;color:CanvasText}"
         "div{text-align:center;opacity:.75}small{opacity:.7}</style></head>"
         "<body><div><p>%@</p><small>%@</small></div></body></html>", text, detail];
    [self.webView loadHTMLString:html baseURL:nil];
}

#pragma mark - Menú

- (NSMenuItem *)add:(NSMenu *)menu title:(NSString *)title action:(SEL)action key:(NSString *)key mods:(NSEventModifierFlags)mods {
    NSMenuItem *item = [menu addItemWithTitle:title action:action keyEquivalent:key];
    if (mods) item.keyEquivalentModifierMask = mods;
    return item;
}

- (void)buildMenu {
    NSMenu *main = [[NSMenu alloc] init];

    NSMenuItem *appItem = [[NSMenuItem alloc] init];
    NSMenu *appMenu = [[NSMenu alloc] init];
    [self add:appMenu title:@"Acerca de Memehub" action:@selector(orderFrontStandardAboutPanel:) key:@"" mods:0];
    [appMenu addItem:[NSMenuItem separatorItem]];
    [self add:appMenu title:@"Abrir carpeta de Memehub" action:@selector(openRoot:) key:@"" mods:0].target = self;
    [self add:appMenu title:@"Abrir pines descargados" action:@selector(openDownloads:) key:@"" mods:0].target = self;
    [appMenu addItem:[NSMenuItem separatorItem]];
    [self add:appMenu title:@"Ocultar Memehub" action:@selector(hide:) key:@"h" mods:0];
    [self add:appMenu title:@"Ocultar otros" action:@selector(hideOtherApplications:) key:@"h" mods:NSEventModifierFlagCommand | NSEventModifierFlagOption];
    [appMenu addItem:[NSMenuItem separatorItem]];
    [self add:appMenu title:@"Salir de Memehub" action:@selector(terminate:) key:@"q" mods:0];
    appItem.submenu = appMenu;
    [main addItem:appItem];

    NSMenuItem *editItem = [[NSMenuItem alloc] init];
    NSMenu *editMenu = [[NSMenu alloc] initWithTitle:@"Editar"];
    [self add:editMenu title:@"Deshacer" action:@selector(undo:) key:@"z" mods:0];
    [self add:editMenu title:@"Rehacer" action:@selector(redo:) key:@"z" mods:NSEventModifierFlagCommand | NSEventModifierFlagShift];
    [editMenu addItem:[NSMenuItem separatorItem]];
    [self add:editMenu title:@"Cortar" action:@selector(cut:) key:@"x" mods:0];
    [self add:editMenu title:@"Copiar" action:@selector(copy:) key:@"c" mods:0];
    [self add:editMenu title:@"Pegar" action:@selector(paste:) key:@"v" mods:0];
    [self add:editMenu title:@"Seleccionar todo" action:@selector(selectAll:) key:@"a" mods:0];
    editItem.submenu = editMenu;
    [main addItem:editItem];

    NSMenuItem *viewItem = [[NSMenuItem alloc] init];
    NSMenu *viewMenu = [[NSMenu alloc] initWithTitle:@"Ver"];
    [self add:viewMenu title:@"Recargar" action:@selector(reloadPage:) key:@"r" mods:0].target = self;
    [viewMenu addItem:[NSMenuItem separatorItem]];
    [self add:viewMenu title:@"Aumentar" action:@selector(zoomIn:) key:@"+" mods:0].target = self;
    [self add:viewMenu title:@"Reducir" action:@selector(zoomOut:) key:@"-" mods:0].target = self;
    [self add:viewMenu title:@"Tamaño real" action:@selector(zoomReset:) key:@"0" mods:0].target = self;
    [viewMenu addItem:[NSMenuItem separatorItem]];
    [self add:viewMenu title:@"Pantalla completa" action:@selector(toggleFullScreen:) key:@"f" mods:NSEventModifierFlagCommand | NSEventModifierFlagControl];
    viewItem.submenu = viewMenu;
    [main addItem:viewItem];

    NSMenuItem *windowItem = [[NSMenuItem alloc] init];
    NSMenu *windowMenu = [[NSMenu alloc] initWithTitle:@"Ventana"];
    [self add:windowMenu title:@"Minimizar" action:@selector(performMiniaturize:) key:@"m" mods:0];
    [self add:windowMenu title:@"Cerrar" action:@selector(performClose:) key:@"w" mods:0];
    [self add:windowMenu title:@"Mantener encima" action:@selector(toggleFloat:) key:@"t" mods:NSEventModifierFlagCommand | NSEventModifierFlagOption].target = self;
    windowItem.submenu = windowMenu;
    [main addItem:windowItem];
    NSApp.windowsMenu = windowMenu;

    NSApp.mainMenu = main;
}

- (BOOL)validateMenuItem:(NSMenuItem *)item {
    if (item.action == @selector(toggleFloat:)) item.state = self.window.level == NSFloatingWindowLevel ? NSControlStateValueOn : NSControlStateValueOff;
    return YES;
}

- (void)reloadPage:(id)sender { [self.webView reload]; }
- (void)zoomIn:(id)sender { self.webView.pageZoom = MIN(2.0, self.webView.pageZoom + 0.1); }
- (void)zoomOut:(id)sender { self.webView.pageZoom = MAX(0.5, self.webView.pageZoom - 0.1); }
- (void)zoomReset:(id)sender { self.webView.pageZoom = 1.0; }
- (void)toggleFloat:(id)sender { self.window.level = self.window.level == NSFloatingWindowLevel ? NSNormalWindowLevel : NSFloatingWindowLevel; }
- (void)openRoot:(id)sender { [[NSWorkspace sharedWorkspace] openURL:[NSURL fileURLWithPath:RootPath()]]; }
- (void)openDownloads:(id)sender {
    NSString *dir = [RootPath() stringByAppendingPathComponent:kDownloadsDir];
    [[NSFileManager defaultManager] createDirectoryAtPath:dir withIntermediateDirectories:YES attributes:nil error:nil];
    [[NSWorkspace sharedWorkspace] openURL:[NSURL fileURLWithPath:dir]];
}

#pragma mark - Mensajes de la página: arrastrar, copiar, mostrar en Finder

- (void)userContentController:(WKUserContentController *)controller didReceiveScriptMessage:(WKScriptMessage *)message {
#ifdef SELFTEST
    if ([message.name isEqualToString:@"selftest"]) {
        printf("%s\n", [[message.body description] UTF8String]);
        fflush(stdout);
        if ([message.body isEqual:@"FIN"]) [NSApp terminate:nil];
        NSDictionary *m = [message.body isKindOfClass:[NSDictionary class]] ? message.body : nil;
        if ([m[@"type"] isEqual:@"synth"]) {
            // Simula mouseDown + arrastre dentro de la app (sin permiso de Accesibilidad).
            CGFloat h = self.webView.bounds.size.height;
            NSPoint p = NSMakePoint([m[@"x"] doubleValue], h - [m[@"y"] doubleValue]);
            NSTimeInterval t = [NSProcessInfo processInfo].systemUptime;
            NSEvent *down = [NSEvent mouseEventWithType:NSEventTypeLeftMouseDown location:p modifierFlags:0 timestamp:t windowNumber:self.window.windowNumber context:nil eventNumber:0 clickCount:1 pressure:1];
            [self.window makeKeyAndOrderFront:nil];
            [NSApp activateIgnoringOtherApps:YES];
            dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.5 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
                [NSApp postEvent:down atStart:NO];
                for (int i = 1; i <= 12; i++) {
                    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)((0.2 + i * 0.05) * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
                        NSEvent *drag = [NSEvent mouseEventWithType:NSEventTypeLeftMouseDragged location:NSMakePoint(p.x + i * 4, p.y - i * 3) modifierFlags:0 timestamp:t + i * 0.05 windowNumber:self.window.windowNumber context:nil eventNumber:0 clickCount:1 pressure:1];
                        [NSApp postEvent:drag atStart:NO];
                    });
                }
            });
        }
        return;
    }
#endif
    NSDictionary *body = [message.body isKindOfClass:[NSDictionary class]] ? message.body : nil;
    NSString *type = body[@"type"];
    if ([type isEqualToString:@"arm"]) { [self arm:body]; return; }
    NSString *file = SafePath(body[@"path"]);
    if (!file || ![[NSFileManager defaultManager] fileExistsAtPath:file]) return;
    NSURL *url = [NSURL fileURLWithPath:file];
    if ([type isEqualToString:@"reveal"]) [[NSWorkspace sharedWorkspace] activateFileViewerSelectingURLs:@[url]];
    else if ([type isEqualToString:@"copy"]) {
        // El archivo (para pegarlo en el Finder) y la imagen (para pegarla en un editor).
        NSPasteboard *pb = [NSPasteboard generalPasteboard];
        [pb clearContents];
        NSPasteboardItem *item = [[NSPasteboardItem alloc] init];
        [item setString:url.absoluteString forType:NSPasteboardTypeFileURL];
        NSImage *image = [[NSImage alloc] initWithContentsOfURL:url];
        if (image.TIFFRepresentation) [item setData:image.TIFFRepresentation forType:NSPasteboardTypeTIFF];
        [pb writeObjects:@[item]];
    }
}

- (NSImage *)dragImageFor:(NSURL *)url thumb:(NSString *)thumb {
    NSImage *image = thumb ? [[NSImage alloc] initWithContentsOfFile:thumb] : nil;
    if (!image.isValid) image = [[NSImage alloc] initWithContentsOfURL:url];
    if (!image.isValid || image.size.width < 1 || image.size.height < 1) image = [[NSWorkspace sharedWorkspace] iconForFile:url.path];
    CGFloat scale = 110.0 / MAX(image.size.width, image.size.height);
    NSSize size = NSMakeSize(round(image.size.width * scale), round(image.size.height * scale));
    return [NSImage imageWithSize:size flipped:NO drawingHandler:^BOOL(NSRect rect) {
        [image drawInRect:rect fromRect:NSZeroRect operation:NSCompositingOperationSourceOver fraction:0.85];
        return YES;
    }];
}

- (void)arm:(NSDictionary *)body {
    NSString *path = body[@"path"];
    BOOL mouseDown = ([NSEvent pressedMouseButtons] & 1) != 0;
#ifdef SELFTEST
    mouseDown = YES;
#endif
    if (!mouseDown || self.dragging) return;
    self.armed = YES;
    self.armedThumb = body[@"thumb"];
    if ([path isKindOfClass:[NSString class]] && path.length) {
        NSString *file = SafePath(path);
        if (!file || ![[NSFileManager defaultManager] fileExistsAtPath:file]) { self.armed = NO; return; }
        self.armedPath = path;
        // El pin terminó de bajarse con el mouse todavía apretado: arrancar ya.
        if (self.waitingForFile && self.lastMouseEvent.type == NSEventTypeLeftMouseDragged) [self startDragWith:self.lastMouseEvent];
    }
}

- (void)startDragWith:(NSEvent *)event {
    NSString *file = SafePath(self.armedPath);
    self.armed = self.waitingForFile = NO;
    if (!file) return;
    NSURL *url = [NSURL fileURLWithPath:file];
    NSImage *image = [self dragImageFor:url thumb:SafePath(self.armedThumb)];
    NSPoint at = [self.webView convertPoint:event.locationInWindow fromView:nil];
    NSDraggingItem *item = [[NSDraggingItem alloc] initWithPasteboardWriter:url];
    [item setDraggingFrame:NSMakeRect(at.x - image.size.width / 2, at.y - image.size.height / 2, image.size.width, image.size.height) contents:image];
    self.dragging = YES;
    NSDraggingSession *session = [self.webView beginDraggingSessionWithItems:@[item] event:event source:self];
    session.animatesToStartingPositionsOnCancelOrFail = YES;
    Log(@"drag iniciado: %@", file);
    [self.webView evaluateJavaScript:@"window.memehubApp && memehubApp._started()" completionHandler:nil];
}

// Solo copiar o enlazar: así el Finder nunca mueve el archivo fuera de Memehub.
- (NSDragOperation)draggingSession:(NSDraggingSession *)session sourceOperationMaskForDraggingContext:(NSDraggingContext)context {
    return context == NSDraggingContextWithinApplication ? NSDragOperationNone : NSDragOperationCopy | NSDragOperationLink;
}

- (void)draggingSession:(NSDraggingSession *)session endedAtPoint:(NSPoint)screenPoint operation:(NSDragOperation)operation {
    Log(@"drag terminado: operacion=%lu", (unsigned long)operation);
    self.dragging = NO;
    [self.webView evaluateJavaScript:@"window.memehubApp && memehubApp._ended()" completionHandler:nil];
    // WebKit no vio el mouseUp (se lo llevó el arrastre): se lo damos para que no quede "apretado".
    NSPoint inWindow = [self.window convertPointFromScreen:screenPoint];
    NSEvent *up = [NSEvent mouseEventWithType:NSEventTypeLeftMouseUp location:inWindow modifierFlags:0
                                    timestamp:[NSProcessInfo processInfo].systemUptime windowNumber:self.window.windowNumber
                                      context:nil eventNumber:0 clickCount:1 pressure:0];
    [self.webView mouseUp:up];
}

#pragma mark - Navegación: lo que no es Memehub se abre en tu navegador

- (void)webView:(WKWebView *)webView decidePolicyForNavigationAction:(WKNavigationAction *)action decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    NSURL *url = action.request.URL;
    NSString *scheme = url.scheme.lowercaseString;
    BOOL mainFrame = action.targetFrame == nil || action.targetFrame.isMainFrame;
    if ([scheme isEqualToString:@"file"]) { decisionHandler(WKNavigationActionPolicyCancel); return; }
    if (mainFrame && ([scheme isEqualToString:@"http"] || [scheme isEqualToString:@"https"])) {
        [[NSWorkspace sharedWorkspace] openURL:url];
        decisionHandler(WKNavigationActionPolicyCancel);
        return;
    }
    decisionHandler(WKNavigationActionPolicyAllow);
}

- (WKWebView *)webView:(WKWebView *)webView createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration forNavigationAction:(WKNavigationAction *)action windowFeatures:(WKWindowFeatures *)features {
    NSURL *url = action.request.URL;
    if ([url.scheme isEqualToString:@"http"] || [url.scheme isEqualToString:@"https"]) [[NSWorkspace sharedWorkspace] openURL:url];
    return nil;
}

- (void)webViewWebContentProcessDidTerminate:(WKWebView *)webView { [webView reload]; }

- (void)webView:(WKWebView *)webView runJavaScriptAlertPanelWithMessage:(NSString *)message initiatedByFrame:(WKFrameInfo *)frame completionHandler:(void (^)(void))completionHandler {
    NSAlert *panel = [[NSAlert alloc] init];
    panel.messageText = message ?: @"";
    [panel runModal];
    completionHandler();
}

@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSApplication *app = [NSApplication sharedApplication];
        AppDelegate *delegate = [[AppDelegate alloc] init];
        app.delegate = delegate;
        [app setActivationPolicy:NSApplicationActivationPolicyRegular];
        [app activateIgnoringOtherApps:YES];
        [app run];
    }
    return 0;
}
