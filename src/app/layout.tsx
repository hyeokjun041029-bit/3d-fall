import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EggDrop Lab — 계란 낙하 물리 실험 시뮬레이터",
  description:
    "15종 완충재의 부착 위치와 수량 배치에 따른 계란 낙하 운동, 회전, 충돌 압축 및 충격력을 계산하고 비교하는 물리 실험 시뮬레이터",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-100 text-slate-900">
        {children}
      </body>
    </html>
  );
}
