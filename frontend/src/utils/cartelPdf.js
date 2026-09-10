// PDF de una página A4 horizontal con la misma imagen que la vista previa.
export function cartelPdf(canvas) {
  const jpeg = Uint8Array.from(atob(canvas.toDataURL("image/jpeg", 0.98).split(",")[1]), c => c.charCodeAt(0));
  const encoder = new TextEncoder();
  const chunks = [];
  const offsets = [0];
  let length = 0;
  const append = value => {
    const bytes = typeof value === "string" ? encoder.encode(value) : value;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id, body) => { offsets[id] = length; append(`${id} 0 obj\n${body}\nendobj\n`); };
  append("%PDF-1.4\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 841.89 595.28] /Resources << /XObject << /Cartel 4 0 R >> >> /Contents 5 0 R >>");
  offsets[4] = length;
  append(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  append(jpeg);
  append("\nendstream\nendobj\n");
  const commands = "q\n841.89 0 0 595.28 0 0 cm\n/Cartel Do\nQ\n";
  object(5, `<< /Length ${encoder.encode(commands).length} >>\nstream\n${commands}endstream`);
  const xref = length;
  append("xref\n0 6\n0000000000 65535 f \n");
  offsets.slice(1).forEach(offset => append(`${String(offset).padStart(10, "0")} 00000 n \n`));
  append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: "application/pdf" });
}
