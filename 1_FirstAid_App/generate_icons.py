import struct
import zlib
import os

def create_png(width, height, get_pixel_func):
    """
    Generate an uncompressed RGBA PNG without external libraries.
    """
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0) # filter type 0 (None)
        for x in range(width):
            r, g, b, a = get_pixel_func(x, y, width, height)
            raw_data.extend([r, g, b, a])
            
    # PNG signature
    png_bytes = bytearray(b'\x89PNG\r\n\x1a\n')
    
    # IHDR chunk
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data)
    png_bytes.extend(struct.pack('>I', len(ihdr_data)) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc))
    
    # IDAT chunk
    compressed = zlib.compress(bytes(raw_data), level=9)
    idat_crc = zlib.crc32(b'IDAT' + compressed)
    png_bytes.extend(struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', idat_crc))
    
    # IEND chunk
    iend_crc = zlib.crc32(b'IEND')
    png_bytes.extend(struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc))
    
    return bytes(png_bytes)

def icon_pixel(x, y, w, h):
    # Rounded box geometry
    cx = w / 2.0
    cy = h / 2.0
    
    # Normalized coords from center [-1, 1]
    nx = (x - cx) / (w / 2.0)
    ny = (y - cy) / (h / 2.0)
    
    # Corner radius check for rounded squircle
    # |nx|^4 + |ny|^4 <= 0.85
    dist = (abs(nx)**4.5 + abs(ny)**4.5)**(1/4.5)
    
    if dist > 0.96:
        # Transparent outside squircle
        return (0, 0, 0, 0)
    
    # Base Red Gradient
    grad = (ny + 1.0) / 2.0  # 0 at top, 1 at bottom
    # #E11D48 (225, 29, 72) to #9F1239 (159, 18, 57)
    r_bg = int(225 - (225 - 159) * grad)
    g_bg = int(29 - (29 - 18) * grad)
    b_bg = int(72 - (72 - 57) * grad)
    
    # Medical cross dimensions
    thick = 0.22  # thickness
    length = 0.58 # length
    
    in_vert = (abs(nx) <= thick) and (abs(ny) <= length)
    in_horiz = (abs(ny) <= thick) and (abs(nx) <= length)
    
    if in_vert or in_horiz:
        # Cross center heart pulse line
        # Pulse is near y=0, between x in [-0.35, 0.35]
        is_pulse = False
        if abs(ny) < 0.16 and abs(nx) < 0.38:
            # heartbeat wave calculation
            px = nx / 0.38  # -1 to 1
            expected_y = 0.0
            if -0.3 <= px <= -0.1:
                expected_y = -((px + 0.2) / 0.1) * 0.08
            elif -0.1 < px <= 0.15:
                expected_y = ((px - 0.02) / 0.1) * 0.12
            elif 0.15 < px <= 0.35:
                expected_y = -((px - 0.25) / 0.1) * 0.06
                
            if abs(ny - expected_y) < 0.035:
                is_pulse = True
                
        if is_pulse:
            return (225, 29, 72, 255) # Red pulse inside cross
        else:
            return (255, 255, 255, 255) # Pure white cross
            
    # Background
    return (r_bg, g_bg, b_bg, 255)

os.makedirs("icons", exist_ok=True)

sizes = [192, 512]
for s in sizes:
    png_data = create_png(s, s, icon_pixel)
    with open(f"icons/icon-{s}.png", "wb") as f:
        f.write(png_data)
    with open(f"icons/icon-maskable-{s}.png", "wb") as f:
        f.write(png_data)
    print(f"Generated {s}x{s} icon")

# Also generate a crisp SVG version
svg_content = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#E11D48"/>
      <stop offset="100%" stop-color="#9F1239"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-opacity="0.25"/>
    </filter>
  </defs>
  <rect width="512" height="512" rx="115" fill="url(#bg)"/>
  <circle cx="256" cy="256" r="215" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="8"/>
  <g filter="url(#shadow)">
    <path d="M 210 110 H 302 V 210 H 402 V 302 H 302 V 402 H 210 V 302 H 110 V 210 H 210 Z" fill="#FFFFFF" rx="16"/>
  </g>
  <path d="M 175 256 L 225 256 L 243 215 L 265 295 L 285 240 L 305 256 L 337 256" fill="none" stroke="#E11D48" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
</svg>'''

with open("icons/icon.svg", "w", encoding="utf-8") as f:
    f.write(svg_content)
with open("icons/favicon.svg", "w", encoding="utf-8") as f:
    f.write(svg_content)
print("Generated SVG icons")
