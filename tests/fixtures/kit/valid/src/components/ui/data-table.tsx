import { useReactTable, getCoreRowModel } from '@tanstack/react-table';
export function DataTable() {
  const t = useReactTable({ data: [], columns: [], getCoreRowModel: getCoreRowModel() });
  return <table className="w-full text-body">{t.getRowModel().rows.length}</table>;
}
