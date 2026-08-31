export type TerminalFontFormat = "truetype" | "opentype" | "woff" | "woff2";

export type CustomTerminalFont = {
  id: string;
  displayName: string;
  format: TerminalFontFormat;
  byteLength: number;
  createdAt: string;
};
