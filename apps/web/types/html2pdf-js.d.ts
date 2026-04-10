declare module 'html2pdf.js' {
  type Html2PdfWorker = {
    set(options: unknown): Html2PdfWorker;
    from(source: HTMLElement | string): Html2PdfWorker;
    save(): Promise<void>;
  };

  type Html2PdfFactory = () => Html2PdfWorker;

  const html2pdf: Html2PdfFactory;
  export default html2pdf;
}
