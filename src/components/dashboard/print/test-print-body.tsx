import { clampPrintMargins, type PrintMargins } from "@/lib/print-settings-types";

type TestPrintBodyProps = {
  margins: PrintMargins;
};

export function TestPrintBody({ margins }: TestPrintBodyProps) {
  const m = clampPrintMargins(margins);

  return (
    <div
      style={{
        border: "0.3mm dashed #000",
        boxSizing: "border-box",
        padding: "3mm",
        fontSize: "10pt",
        height: `calc(297mm - ${m.header_mm + m.footer_mm}mm - 4mm)`,
      }}
    >
      <p style={{ fontWeight: 700 }}>TEST PRINT</p>
      <p>
        Body area: header {m.header_mm} mm, footer {m.footer_mm} mm, left {m.left_mm} mm, right {m.right_mm} mm
      </p>
      <p>
        Hold this sheet over your letterhead: the dashed box should sit inside your blank body area. Assumes A4
        paper.
      </p>
    </div>
  );
}
