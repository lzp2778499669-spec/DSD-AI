migrate((app) => {
    const collection = app.findCollectionByNameOrId("users");

    if (!collection.fields.getByName("username")) {
        collection.fields.add(new TextField({ name: "username", min: 3, max: 80 }));
        // passwordAuth 的 identityFields 要求登录标识字段有单列 UNIQUE 索引
        collection.addIndex("users_username_unique", true, "username");
    }

    if (!collection.fields.getByName("accessStatus")) {
        collection.fields.add(new SelectField({
            name: "accessStatus",
            maxSelect: 1,
            values: ["pending", "approved", "disabled"],
        }));
    }

    collection.authRule = "";
    collection.listRule = "id = @request.auth.id";
    collection.viewRule = "id = @request.auth.id";
    collection.createRule = '@request.body.accessStatus = "pending"';
    collection.updateRule = "id = @request.auth.id && (@request.body.accessStatus:changed = false || @request.body.accessStatus = accessStatus)";
    collection.deleteRule = "id = @request.auth.id";
    collection.passwordAuth = { enabled: true, identityFields: ["username", "email"] };

    app.save(collection);

    const records = app.findRecordsByFilter("users", "id != ''", "", 500, 0);
    for (const record of records) {
        if (!record.getString("username")) {
            const email = record.getString("email");
            record.set("username", email.split("@")[0].slice(0, 80) || `user-${record.id}`);
        }
        if (!record.getString("accessStatus")) {
            record.set("accessStatus", "pending");
        }
        app.save(record);
    }

    collection.fields.getByName("username").required = true;
    collection.fields.getByName("accessStatus").required = true;
    collection.passwordAuth = { enabled: true, identityFields: ["username"] };
    app.save(collection);
}, (app) => {
    const collection = app.findCollectionByNameOrId("users");
    collection.fields.removeByName("accessStatus");
    collection.fields.removeByName("username");
    app.save(collection);
});
