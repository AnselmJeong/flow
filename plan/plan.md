The current app is nearly complete as an epub-specialized viewer. However, I want to apply nearly the same functionality to reading PDFs by adding the following features:

1. When importing books in the library, it should support importing PDFs in addition to epubs.
2. When a PDF book is clicked, use react-pdf(https://github.com/wojtekmaj/react-pdf) or/and react-pdf-viewer (https://github.com/react-pdf-viewer/react-pdf-viewer, always refer to the latest usage instructions at https://react-pdf-viewer.dev/docs/) to display the PDF viewer instead of the current epub viewer.
3. The PDF viewer should default to a two-page view but also support other view modes (e.g., scroll, one-page).
4. If the PDF has content, handle it within react-pdf-viewer. The TOC panel in the left sidebar does not need to display anything.
5. In the PDF viewer, text selection followed by a right-click should display the same context menu as in the epub viewer, including highlight, annotation, and AI chatting functions.
6. For PDFs, since accurate page numbering is available, store the location directly by page number instead of using CFI as in epubs.
7. In using react-pdf-viewer, Keep in mind that advanced features rely on plugins. Remember that scroll-mode, default-layout, highlight, page navigation, search, etc., are all executed by individual plugins so that each plugin has to be installed separately.