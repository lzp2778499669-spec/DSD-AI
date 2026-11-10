migrate((app) => {
    const users = app.findCollectionByNameOrId("users");
    const groups = new Collection({
        type: "base",
        name: "groups",
        fields: [
            new TextField({ name: "name", required: true, min: 1, max: 80 }),
            new TextField({ name: "inviteCode", required: true, min: 8, max: 32, hidden: true }),
            new RelationField({ name: "owner", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false }),
        ],
        indexes: ["CREATE UNIQUE INDEX idx_groups_invite_code ON groups (inviteCode)"],
        listRule: '@request.auth.id != "" && (@collection.group_memberships.group ?= id && @collection.group_memberships.user ?= @request.auth.id && @collection.group_memberships.status ?= "approved" || owner = @request.auth.id)',
        viewRule: '@request.auth.id != "" && (@collection.group_memberships.group ?= id && @collection.group_memberships.user ?= @request.auth.id && @collection.group_memberships.status ?= "approved" || owner = @request.auth.id)',
        createRule: '@request.auth.id != "" && @request.body.owner = @request.auth.id',
        updateRule: '@request.auth.id != "" && owner = @request.auth.id',
        deleteRule: '@request.auth.id != "" && owner = @request.auth.id',
    });
    app.save(groups);

    const memberships = new Collection({
        type: "base",
        name: "group_memberships",
        fields: [
            new RelationField({ name: "group", required: true, collectionId: groups.id, maxSelect: 1, cascadeDelete: false }),
            new RelationField({ name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false }),
            new SelectField({ name: "status", required: true, maxSelect: 1, values: ["pending", "approved"] }),
        ],
        indexes: ["CREATE UNIQUE INDEX idx_group_memberships_group_user ON group_memberships (\"group\", user)"],
        listRule: '@request.auth.id != "" && (user = @request.auth.id || (@collection.groups.id ?= group && @collection.groups.owner ?= @request.auth.id) || (@collection.group_memberships_via_group.group ?= group && @collection.group_memberships_via_group.user ?= @request.auth.id && @collection.group_memberships_via_group.status ?= "approved"))',
        viewRule: '@request.auth.id != "" && (user = @request.auth.id || (@collection.groups.id ?= group && @collection.groups.owner ?= @request.auth.id) || (@collection.group_memberships_via_group.group ?= group && @collection.group_memberships_via_group.user ?= @request.auth.id && @collection.group_memberships_via_group.status ?= "approved"))',
        createRule: null,
        updateRule: null,
        deleteRule: '@request.auth.id != "" && (user = @request.auth.id || (@collection.groups.id ?= group && @collection.groups.owner ?= @request.auth.id))',
    });
    app.save(memberships);

    const applications = new Collection({
        type: "base",
        name: "group_applications",
        fields: [
            new RelationField({ name: "group", required: true, collectionId: groups.id, maxSelect: 1, cascadeDelete: false }),
            new RelationField({ name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false }),
            new TextField({ name: "inviteCode", required: true, min: 8, max: 32 }),
        ],
        indexes: ["CREATE UNIQUE INDEX idx_group_applications_group_user ON group_applications (\"group\", user)"],
        listRule: '@request.auth.id != "" && (@collection.groups.id ?= group && @collection.groups.owner ?= @request.auth.id || user = @request.auth.id)',
        viewRule: '@request.auth.id != "" && (@collection.groups.id ?= group && @collection.groups.owner ?= @request.auth.id || user = @request.auth.id)',
        createRule: '@request.auth.id != "" && @request.body.user = @request.auth.id && @collection.groups.id ?= @request.body.group && @collection.groups.inviteCode ?= @request.body.inviteCode',
        updateRule: null,
        deleteRule: '@request.auth.id != "" && (@collection.groups.id ?= group && @collection.groups.owner ?= @request.auth.id || user = @request.auth.id)',
    });
    app.save(applications);

    const canvases = new Collection({
        type: "base",
        name: "group_canvases",
        fields: [
            new RelationField({ name: "group", required: true, collectionId: groups.id, maxSelect: 1, cascadeDelete: false }),
            new RelationField({ name: "owner", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false }),
            new TextField({ name: "projectId", required: true, min: 1, max: 100 }),
            new TextField({ name: "title", required: true, min: 1, max: 200 }),
            new JSONField({ name: "snapshot", required: true, maxSize: 10000000 }),
        ],
        indexes: ["CREATE UNIQUE INDEX idx_group_canvases_project ON group_canvases (\"group\", owner, projectId)"],
        listRule: '@request.auth.id != "" && @collection.group_memberships.group ?= group && @collection.group_memberships.user ?= @request.auth.id && @collection.group_memberships.status ?= "approved"',
        viewRule: '@request.auth.id != "" && @collection.group_memberships.group ?= group && @collection.group_memberships.user ?= @request.auth.id && @collection.group_memberships.status ?= "approved"',
        createRule: '@request.auth.id != "" && @request.body.owner = @request.auth.id && @collection.group_memberships.group ?= @request.body.group && @collection.group_memberships.user ?= @request.auth.id && @collection.group_memberships.status ?= "approved"',
        updateRule: '@request.auth.id != "" && owner = @request.auth.id && @collection.group_memberships.group ?= group && @collection.group_memberships.user ?= @request.auth.id && @collection.group_memberships.status ?= "approved"',
        deleteRule: '@request.auth.id != "" && owner = @request.auth.id && @collection.group_memberships.group ?= group && @collection.group_memberships.user ?= @request.auth.id && @collection.group_memberships.status ?= "approved"',
    });
    app.save(canvases);
}, (app) => {
    app.delete(app.findCollectionByNameOrId("group_canvases"));
    app.delete(app.findCollectionByNameOrId("group_applications"));
    app.delete(app.findCollectionByNameOrId("group_memberships"));
    app.delete(app.findCollectionByNameOrId("groups"));
});
