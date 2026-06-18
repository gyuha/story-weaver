import { HdIcon } from './hd-icon'

interface Props {
  page: number
  totalPages: number
  onPage: (n: number) => void
}

export function HdPagination({ page, totalPages, onPage }: Props) {
  if (totalPages <= 1) return null

  let start = Math.max(1, page - 2)
  const end = Math.min(totalPages, start + 4)
  start = Math.max(1, end - 4)
  const pages: number[] = []
  for (let i = start; i <= end; i++) pages.push(i)

  return (
    <div className="w-pagination">
      <button className="w-page" onClick={() => onPage(1)} disabled={page === 1} type="button">
        <HdIcon name="chevronsLeft" size={16} />
      </button>
      <button className="w-page" onClick={() => onPage(page - 1)} disabled={page === 1} type="button">
        <HdIcon name="chevronLeft" size={16} />
      </button>
      {pages.map((p) => (
        <button
          key={p}
          className={p === page ? 'w-page w-page--active' : 'w-page'}
          onClick={() => onPage(p)}
          type="button"
        >
          {p}
        </button>
      ))}
      <button className="w-page" onClick={() => onPage(page + 1)} disabled={page === totalPages} type="button">
        <HdIcon name="chevronRight" size={16} />
      </button>
      <button className="w-page" onClick={() => onPage(totalPages)} disabled={page === totalPages} type="button">
        <HdIcon name="chevronsRight" size={16} />
      </button>
    </div>
  )
}
