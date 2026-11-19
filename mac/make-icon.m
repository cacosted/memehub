// Dibuja el icono de Memehub (una Poké Ball, como el favicon de la web) en un PNG de 1024 px.
#import <Cocoa/Cocoa.h>

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc < 2) return 1;
        const CGFloat S = 1024;
        NSBitmapImageRep *rep = [[NSBitmapImageRep alloc] initWithBitmapDataPlanes:NULL pixelsWide:S pixelsHigh:S bitsPerSample:8
            samplesPerPixel:4 hasAlpha:YES isPlanar:NO colorSpaceName:NSDeviceRGBColorSpace bytesPerRow:0 bitsPerPixel:0];
        [NSGraphicsContext saveGraphicsState];
        [NSGraphicsContext setCurrentContext:[NSGraphicsContext graphicsContextWithBitmapImageRep:rep]];

        // Fondo redondeado estilo macOS
        NSRect tile = NSMakeRect(100, 100, 824, 824);
        [[NSColor colorWithSRGBRed:0.98 green:0.96 blue:0.91 alpha:1] setFill];
        [[NSBezierPath bezierPathWithRoundedRect:tile xRadius:185 yRadius:185] fill];

        NSColor *ink = [NSColor colorWithSRGBRed:0.07 green:0.07 blue:0.07 alpha:1];
        NSPoint c = NSMakePoint(512, 512);
        CGFloat r = 300;
        NSRect ball = NSMakeRect(c.x - r, c.y - r, 2 * r, 2 * r);

        // Mitad de abajo blanca, mitad de arriba roja
        [[NSColor whiteColor] setFill];
        [[NSBezierPath bezierPathWithOvalInRect:ball] fill];
        NSBezierPath *top = [NSBezierPath bezierPath];
        [top appendBezierPathWithArcWithCenter:c radius:r startAngle:0 endAngle:180];
        [top closePath];
        [[NSColor colorWithSRGBRed:0.94 green:0.27 blue:0.27 alpha:1] setFill];
        [top fill];

        // Contorno y franja
        [ink setStroke];
        NSBezierPath *ring = [NSBezierPath bezierPathWithOvalInRect:NSInsetRect(ball, 20, 20)];
        ring.lineWidth = 40;
        [ring stroke];
        [ink setFill];
        NSRectFill(NSMakeRect(c.x - r, c.y - 22, 2 * r, 44));

        // Botón
        NSRect button = NSMakeRect(c.x - 92, c.y - 92, 184, 184);
        [[NSBezierPath bezierPathWithOvalInRect:button] fill];
        [[NSColor whiteColor] setFill];
        [[NSBezierPath bezierPathWithOvalInRect:NSInsetRect(button, 40, 40)] fill];

        [NSGraphicsContext restoreGraphicsState];
        NSData *png = [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
        return [png writeToFile:[NSString stringWithUTF8String:argv[1]] atomically:YES] ? 0 : 1;
    }
}
