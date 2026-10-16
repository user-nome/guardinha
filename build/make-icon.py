#!/usr/bin/env python3
"""Gera o ícone do aplicativo (build/icon.png) usando apenas PIL."""

import os
from PIL import Image, ImageDraw

SIZE = 512
RADIUS = 110
SLATE_200 = (226, 233, 245, 255)
SLATE_900 = (13, 18, 38, 255)
EMERALD_500 = (16, 185, 129, 255)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def gradient(size, top, bottom):
    img = Image.new("RGBA", (size, size))
    px = img.load()
    for y in range(size):
        color = lerp(top, bottom, y / (size - 1))
        for x in range(size):
            px[x, y] = color
    return img


def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def main():
    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icon.png")

    icon = gradient(SIZE, (13, 18, 38), (6, 10, 24))
    icon.putalpha(rounded_mask(SIZE, RADIUS))

    draw = ImageDraw.Draw(icon)

    # moldura: contorno esmeralda interno
    draw.rounded_rectangle(
        (16, 16, SIZE - 17, SIZE - 17), radius=RADIUS - 14, outline=EMERALD_500, width=6
    )

    # cadeado: arco + pernas (debaixo do corpo)
    shackle_bbox = (186, 158, 326, 298)
    draw.arc(shackle_bbox, start=180, end=360, fill=SLATE_200, width=30)
    draw.line([(186, 228), (186, 256)], fill=SLATE_200, width=30)
    draw.line([(326, 228), (326, 256)], fill=SLATE_200, width=30)

    # corpo
    draw.rounded_rectangle((150, 240, 362, 412), radius=30, fill=SLATE_200)

    # fechadura
    draw.ellipse((232, 282, 280, 330), fill=SLATE_900)
    draw.polygon([(244, 310), (268, 310), (262, 358), (250, 358)], fill=SLATE_900)

    # brilho sutil (respeitando o arredondamento)
    gloss = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(gloss).ellipse((-120, -220, SIZE + 120, 200), fill=(255, 255, 255, 22))
    alpha = Image.composite(gloss.getchannel("A"), Image.new("L", (SIZE, SIZE), 0), rounded_mask(SIZE, RADIUS))
    gloss.putalpha(alpha)
    icon = Image.alpha_composite(icon, gloss)

    icon.save(out_path)
    print("ícone gerado em build/icon.png")


if __name__ == "__main__":
    main()
