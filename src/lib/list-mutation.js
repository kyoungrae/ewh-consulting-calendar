// A successful write returns the server's authoritative item. Apply it before
// refreshing so callers need not wait for a second network round trip. Bulk
// writes that cannot be applied locally still wait for the authoritative list.
export function createMutationGate() {
    let current = null;
    return {
        enter(token) {
            current = token;
            return () => { if (current === token) current = null; };
        },
        isCurrent(token) { return token !== null && token === current; },
    };
}

export async function runListMutation({ request, apply, refresh, isCurrent = () => true }) {
    if (!isCurrent()) return undefined;
    const result = await request();
    // Do not let a result started by a logged-out user touch the new user's
    // state, return its data to an old caller, or trigger a read with new credentials.
    if (!isCurrent()) return undefined;
    const applied = apply?.(result) === true;
    // Start the refresh synchronously so the list hook replaces its in-flight
    // marker before an older GET can overwrite the just-saved item.
    let refreshed;
    try { refreshed = Promise.resolve(refresh()).catch(() => {}); }
    catch { refreshed = Promise.resolve(); }
    if (!applied) await refreshed;
    return result;
}
