migrate((_app) => {
    // PocketBase ships with the users auth collection. The next migration
    // extends that existing collection instead of creating a duplicate.
}, (_app) => {});
