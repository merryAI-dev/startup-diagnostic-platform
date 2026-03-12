import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/redesign/app/components/ui/pagination";

type PaginationControlsProps = {
  page: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
  alwaysShow?: boolean;
};

function buildVisiblePages(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis-right", totalPages] as const;
  }

  if (currentPage >= totalPages - 3) {
    return [1, "ellipsis-left", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages] as const;
  }

  return [1, "ellipsis-left", currentPage - 1, currentPage, currentPage + 1, "ellipsis-right", totalPages] as const;
}

export function PaginationControls({
  page,
  totalItems,
  pageSize,
  onPageChange,
  className,
  alwaysShow = false,
}: PaginationControlsProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  if (!alwaysShow && totalItems <= pageSize) {
    return null;
  }

  const visiblePages = buildVisiblePages(page, totalPages);

  return (
    <Pagination className={className}>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            onClick={(event) => {
              event.preventDefault();
              if (page <= 1) return;
              onPageChange(page - 1);
            }}
            className={page <= 1 ? "pointer-events-none opacity-40" : ""}
          />
        </PaginationItem>
        {visiblePages.map((item, index) => {
          if (typeof item !== "number") {
            return (
              <PaginationItem key={`${item}-${index}`}>
                <PaginationEllipsis />
              </PaginationItem>
            );
          }

          return (
            <PaginationItem key={item}>
              <PaginationLink
                href="#"
                isActive={item === page}
                onClick={(event) => {
                  event.preventDefault();
                  if (item === page) return;
                  onPageChange(item);
                }}
              >
                {item}
              </PaginationLink>
            </PaginationItem>
          );
        })}
        <PaginationItem>
          <PaginationNext
            href="#"
            onClick={(event) => {
              event.preventDefault();
              if (page >= totalPages) return;
              onPageChange(page + 1);
            }}
            className={page >= totalPages ? "pointer-events-none opacity-40" : ""}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
