/**
 * Format a timestamp into a readable date string
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  
  // Format date with leading zeros for day and month
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  // Format time with leading zeros
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}
