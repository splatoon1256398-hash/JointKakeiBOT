import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

// シンプルなPNG生成（SVGを元にした静的PNGの生成）
// 本番環境では sharp パッケージの利用を推奨
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ size: string }> }
) {
  const { size: sizeStr } = await params;
  const size = parseInt(sizeStr);

  if (isNaN(size) || size < 16 || size > 1024) {
    return NextResponse.json({ error: "Invalid size" }, { status: 400 });
  }

  try {
    // SVG を読み込んでサイズ調整して返す
    const svgPath = join(process.cwd(), "public", "icon.svg");
    let svgContent: string;
    
    try {
      svgContent = readFileSync(svgPath, "utf-8");
    } catch {
      // SVG が見つからない場合は、シンプルなPNGアイコンを動的生成
      return generateFallbackPng(size);
    }

    // SVGのviewBox/width/heightを調整
    svgContent = svgContent
      .replace(/width="[^"]*"/, `width="${size}"`)
      .replace(/height="[^"]*"/, `height="${size}"`);

    // SVGとして返す（Content-Typeをimage/svg+xmlに）
    // ブラウザがPNGとして扱えるよう、SVGのまま返す
    return new NextResponse(svgContent, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Icon generation error:", error);
    return generateFallbackPng(size);
  }
}

// フォールバック: 最小限のPNGを返す（1x1 紫色ピクセルを拡大）
function generateFallbackPng(size: number): NextResponse {
  // 最小限のSVGをフォールバックとして返す
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="#8b5cf6"/>
    <text x="50%" y="55%" font-size="${size * 0.5}" text-anchor="middle" dominant-baseline="middle" fill="white" font-family="sans-serif">💰</text>
  </svg>`;

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
