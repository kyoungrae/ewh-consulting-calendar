import test from 'node:test';
import assert from 'node:assert/strict';
import { runListMutation } from '../src/lib/list-mutation.js';

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

test('a saved item is shown and the caller finishes before the list refresh completes', async () => {
    const saved = { id: 'consultant-1', name: '변경된 이름' };
    const list = [{ id: 'consultant-1', name: '이전 이름' }];
    const refresh = deferred();
    let refreshed = false;
    const result = await runListMutation({
        request: async () => saved,
        apply: item => { list[0] = item; return true; },
        refresh: async () => { await refresh.promise; refreshed = true; },
    });
    assert.equal(result, saved);
    assert.equal(list[0].name, '변경된 이름');
    assert.equal(refreshed, false);
    refresh.resolve();
    await refresh.promise;
});

test('failed saves do not change the list or trigger a refresh', async () => {
    let touched = false;
    await assert.rejects(runListMutation({
        request: async () => { throw new Error('save failed'); },
        apply: () => { touched = true; return true; },
        refresh: () => { touched = true; },
    }), /save failed/);
    assert.equal(touched, false);
});

test('bulk saves still wait for the authoritative list without retrying a successful write', async () => {
    const refresh = deferred();
    let finished = false;
    let requests = 0;
    const saving = runListMutation({
        request: async () => { requests += 1; return { imported: 2 }; },
        refresh: () => refresh.promise,
    }).then(result => { finished = true; return result; });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(finished, false);
    refresh.resolve();
    assert.deepEqual(await saving, { imported: 2 });
    assert.equal(requests, 1);
});
