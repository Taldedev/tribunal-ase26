/*
 * casesDb.js - storage for finished cases.
 *
 * Every deliberation is written here in full: the charge sheet, the four
 * speeches, the three rulings and the whole call log with its tokens, cost
 * and timings. That record is what makes a past case findable, and what makes
 * the comparison between the two arrangements possible at all, since the two
 * runs being compared happen minutes apart.
 *
 * IndexedDB is used rather than localStorage because a single run with four
 * speeches and three reasoned rulings is comfortably larger than a localStorage
 * quota would like.
 */

import { DATABASE_NAME, DATABASE_VERSION, CASE_STORE } from "../constants.js";

// Opens the database, creating the store the first time. Resolves with a small
// object of methods rather than the raw connection, so callers never deal with
// IndexedDB request events themselves.
export function openCasesDB(name, version) {
    return new Promise(function (resolve, reject) {
        if (!globalThis.indexedDB) {
            reject(new Error("This browser has no IndexedDB, so cases cannot be stored."));
            return;
        }

        const request = indexedDB.open(name || DATABASE_NAME, version || DATABASE_VERSION);

        request.onupgradeneeded = function (event) {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(CASE_STORE)) {
                const store = database.createObjectStore(CASE_STORE, { keyPath: "runId" });
                // Cases are almost always read newest first.
                store.createIndex("createdAt", "createdAt", { unique: false });
                // And grouped by arrangement when the two are compared.
                store.createIndex("config", "config", { unique: false });
            }
        };

        request.onerror = function () {
            reject(request.error || new Error("The case database could not be opened."));
        };

        request.onsuccess = function () {
            resolve(wrap(request.result));
        };
    });
}

function wrap(database) {
    function transaction(mode) {
        return database.transaction(CASE_STORE, mode).objectStore(CASE_STORE);
    }

    function promisify(request) {
        return new Promise(function (resolve, reject) {
            request.onsuccess = function () {
                resolve(request.result);
            };
            request.onerror = function () {
                reject(request.error);
            };
        });
    }

    return {
        // Stores one finished run. The run id is the key, so saving the same
        // run twice updates it rather than duplicating it.
        async addCase(run) {
            const record = {
                runId: run.runId,
                createdAt: run.createdAt,
                config: run.config,
                chargeSheet: run.chargeSheet,
                models: run.models,
                speeches: run.speeches,
                rulings: run.rulings,
                calls: run.calls,
                totals: run.totals,
                tally: run.tally,
                budgetUsd: run.budgetUsd,
                ok: run.ok !== false
            };
            await promisify(transaction("readwrite").put(record));
            return record;
        },

        // Every stored case, newest first.
        async getAllCases() {
            const rows = await promisify(transaction("readonly").getAll());
            return rows.sort(function (a, b) {
                return String(b.createdAt).localeCompare(String(a.createdAt));
            });
        },

        async getCase(runId) {
            return promisify(transaction("readonly").get(runId));
        },

        async deleteCase(runId) {
            await promisify(transaction("readwrite").delete(runId));
            return true;
        },

        async clear() {
            await promisify(transaction("readwrite").clear());
            return true;
        }
    };
}
