export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("es-GT", {
    dateStyle: "medium",
  }).format(new Date(date));
}
