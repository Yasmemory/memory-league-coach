import type { Metadata } from "next";
import "./style.css";
export const metadata: Metadata = { title: "練習記録と振り返り", description: "メモリースポーツの練習記録" };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
