// A successful write returns the server's authoritative item. Apply it before
// refreshing so callers need not wait for a second network round trip. Bulk
// writes that cannot be applied locally still wait for the authoritative list.
export async function runListMutation({ request, apply, refresh }) {
    const result = await request();
    const applied = apply?.(result) === true;
    // Start the refresh synchronously so the list hook replaces its in-flight
    // marker before an older GET can overwrite the just-saved item.
    let refreshed;
    try { refreshed = Promise.resolve(refresh()).catch(() => {}); }
    catch { refreshed = Promise.resolve(); }
    if (!applied) await refreshed;
    return result;
}
