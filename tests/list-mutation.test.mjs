import test from 'node:test';
import assert from 'node:assert/strict';
import { createMutationGate, runListMutation } from '../src/lib/list-mutation.js';

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

test('a list request already in flight cannot replace a just-saved item with stale data', async () => {
    const oldGet = deferred();
    const newGet = deferred();
    let current = 'old';
    let shown = 'before';
    const oldDone = oldGet.promise.then(() => { if (current === 'old') shown = 'stale'; });
    await runListMutation({
        request: async () => ({ name: 'saved' }),
        apply: item => { shown = item.name; oldGet.resolve(); return true; },
        refresh: () => { current = 'new'; return newGet.promise; },
    });
    await oldDone;
    assert.equal(shown, 'saved');
    newGet.resolve();
});

test('a refresh from the first of two quick saves cannot replace the second save', async () => {
    const firstGet = deferred();
    const secondGet = deferred();
    let current = 0;
    let shown = 'before';
    const refresh = (number, deferredGet) => {
        current = number;
        return deferredGet.promise.then(() => { if (current === number) shown = `refresh-${number}`; });
    };
    const save = (name, number, deferredGet) => runListMutation({
        request: async () => ({ name }),
        apply: item => { shown = item.name; return true; },
        refresh: () => refresh(number, deferredGet),
    });
    await save('first', 1, firstGet);
    await save('second', 2, secondGet);
    firstGet.resolve();
    await firstGet.promise;
    assert.equal(shown, 'second');
    secondGet.resolve();
    await secondGet.promise;
    assert.equal(shown, 'refresh-2');
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

test('a pending write cannot apply or refresh after a different user signs in', async () => {
    const gate = createMutationGate();
    const sessionA = {};
    const leaveA = gate.enter(sessionA);
    const pending = deferred();
    let touched = false;
    const saving = runListMutation({
        isCurrent: () => gate.isCurrent(sessionA),
        request: () => pending.promise,
        apply: () => { touched = true; return true; },
        refresh: () => { touched = true; },
    });
    leaveA();
    const leaveB = gate.enter({});
    pending.resolve({ id: 'a-private-record' });
    assert.equal(await saving, undefined);
    assert.equal(touched, false);
    leaveB();
});

test('logging back in as the same user creates a new mutation lifetime', async () => {
    const gate = createMutationGate();
    const firstSession = {};
    const leaveFirstSession = gate.enter(firstSession);
    const oldSession = () => gate.isCurrent(firstSession);
    leaveFirstSession();
    const secondSession = {};
    gate.enter(secondSession);
    let requests = 0;
    const stale = await runListMutation({
        isCurrent: oldSession,
        request: async () => { requests += 1; },
        refresh: () => {},
    });
    assert.equal(stale, undefined);
    assert.equal(requests, 0);
    const current = await runListMutation({
        isCurrent: () => gate.isCurrent(secondSession),
        request: async () => { requests += 1; return { id: 'saved' }; },
        apply: () => true,
        refresh: () => {},
    });
    assert.equal(current.id, 'saved');
    assert.equal(requests, 1);
});
