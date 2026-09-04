export const normalizeListResponse = (response) => {
    const body = response?.data || {};
    const payload = body.data;
    const items = Array.isArray(payload)
        ? payload
        : (payload?.items || payload?.data || body.items || []);
    const pagination = body.pagination || payload?.pagination || body.meta || {};
    const pageInfo = body.pageInfo || payload?.pageInfo || pagination;
    const nextCursor = pageInfo.nextCursor ?? pageInfo.next ?? body.nextCursor ?? null;
    const page = Number(pagination.page) || 1;
    const pages = Number(pagination.pages) || 0;
    const explicitHasNext = pageInfo.hasNextPage ?? pageInfo.hasNext ?? pageInfo.hasMore ?? body.hasMore;
    const rawTotal = pagination.total ?? body.total;

    return {
        items: Array.isArray(items) ? items : [],
        total: rawTotal != null && Number.isFinite(Number(rawTotal)) ? Number(rawTotal) : null,
        nextCursor,
        hasNext: explicitHasNext == null
            ? (nextCursor != null || (pages > 0 && page < pages))
            : Boolean(explicitHasNext),
        nextPage: pages > page ? page + 1 : null,
    };
};
