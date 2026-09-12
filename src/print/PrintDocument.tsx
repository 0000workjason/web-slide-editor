import type { PresentationDocument } from '../model/presentation'
import { SlideRenderer } from '../components/SlideRenderer'

interface PrintDocumentProps {
  presentation: PresentationDocument
}

export function PrintDocument({ presentation }: PrintDocumentProps) {
  return (
    <section className="print-document" aria-label="列印投影片">
      {presentation.slideOrder.map((slideId, index) => (
        <article
          key={slideId}
          className="print-page"
          aria-label={`列印投影片 ${index + 1}`}
        >
          <SlideRenderer
            className="print-slide"
            slide={presentation.slides[slideId]}
            canvas={presentation.canvas}
          />
        </article>
      ))}
    </section>
  )
}
