# Lead Management Frontend

A React application with Tailwind CSS for managing leads with server-side pagination, sorting, and filtering.

## Features

- **Server-side Pagination**: Navigate through pages of leads efficiently
- **Server-side Sorting**: Click column headers to sort by any field
- **Filtering**: Filter leads by name, email, company, and status
- **Responsive Design**: Built with Tailwind CSS for mobile and desktop
- **Loading States**: Visual feedback during data fetching

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## API Integration

The application connects to `http://localhost:3000/api/leads` with the following query parameters:

- `page`: Current page number
- `limit`: Number of items per page
- `sortBy`: Field to sort by
- `sortOrder`: 'asc' or 'desc'
- Additional filter parameters (name, email, company, status)

### Expected API Response Format

```json
{
  "data": [...],
  "total": 100,
  "totalPages": 10,
  "currentPage": 1
}
```

Or simply:

```json
{
  "leads": [...],
  "total": 100
}
```

## Customization

You can customize the columns and filters in `src/components/LeadsGrid.jsx` based on your API's data structure.
