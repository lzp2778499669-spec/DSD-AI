import { App, Button, Input, Modal, Popover, Spin, Tag, Tooltip } from "antd";
import { Check, Eye, LogIn, Plus, RefreshCw, Search, Settings2, Trash2, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { GroupApiConfigModal } from "@/components/layout/config-group-api-modal";
import { useAuthStore } from "@/stores/use-auth-store";
import { useGroupStore } from "@/stores/use-group-store";
import { createGroup, deleteGroup, loadGroupApplications, loadGroupMembers, removeGroupMember, requestGroupMembership, reviewGroupApplication, searchGroups, type GroupMembership, type GroupRecord } from "@/services/api/groups";

function groupErrorMessage(error: unknown, fallback: string) {
    const message = error instanceof Error ? error.message : String(error || "");
    if (/invalid invite code/i.test(message)) return "邀请码不正确";
    if (/already .*member|duplicate key/i.test(message)) return "你已经是该组成员或已提交申请";
    if (/only create one group/i.test(message)) return "每人只能创建一个组，请先删除未通过的组";
    if (/group not available|not approved/i.test(message)) return "该组尚未通过审核";
    return message || fallback;
}

export function ConfigGroups() {
    const { message, modal } = App.useApp();
    const navigate = useNavigate();
    const user = useAuthStore((state) => state.user);
    const groups = useGroupStore((state) => state.groups);
    const activeGroupId = useGroupStore((state) => state.activeGroupId);
    const groupsLoading = useGroupStore((state) => state.loading);
    const refreshGroups = useGroupStore((state) => state.refresh);
    const setActiveGroup = useGroupStore((state) => state.setActiveGroup);
    const [members, setMembers] = useState<GroupMembership[]>([]);
    const [applications, setApplications] = useState<GroupMembership[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const [createOpen, setCreateOpen] = useState(false);
    const [groupName, setGroupName] = useState("");
    const [createCode, setCreateCode] = useState("");
    const [creating, setCreating] = useState(false);
    const [searchName, setSearchName] = useState("");
    const [searching, setSearching] = useState(false);
    const [results, setResults] = useState<GroupRecord[]>([]);
    const [joinGroup, setJoinGroup] = useState<GroupRecord | null>(null);
    const [joinCode, setJoinCode] = useState("");
    const [joining, setJoining] = useState(false);
    const [infoMember, setInfoMember] = useState<GroupMembership | null>(null);
    const [configOpen, setConfigOpen] = useState(false);
    const selected = groups.find((group) => group.id === activeGroupId) || null;
    const isOwner = selected?.role === "owner" || selected?.owner_id === user?.id;
    const pending = selected?.access_status === "待审核";
    const disabled = selected?.access_status === "未通过";
    const notApproved = pending || disabled;

    useEffect(() => {
        void refreshGroups().catch((error) => message.error(groupErrorMessage(error, "加载组信息失败")));
    }, [message, refreshGroups]);

    useEffect(() => {
        if (!activeGroupId) {
            setMembers([]);
            setApplications([]);
            return;
        }
        let active = true;
        setDetailLoading(true);
        void Promise.all([loadGroupMembers(activeGroupId), loadGroupApplications(activeGroupId)])
            .then(([nextMembers, nextApplications]) => {
                if (!active) return;
                setMembers(nextMembers);
                setApplications(nextApplications);
            })
            .catch((error) => { if (active) message.error(groupErrorMessage(error, "加载组信息失败")); })
            .finally(() => { if (active) setDetailLoading(false); });
        return () => { active = false; };
    }, [activeGroupId, message, reloadKey]);

    const selectGroup = async (groupId: string) => {
        try { await setActiveGroup(groupId); }
        catch (error) { message.error(groupErrorMessage(error, "切换组失败")); }
    };

    const handleCreate = async () => {
        if (!groupName.trim()) { message.warning("请输入组名"); return; }
        if (createCode.trim().length < 8) { message.warning("邀请码至少 8 位"); return; }
        setCreating(true);
        try {
            const group = await createGroup(groupName, createCode);
            setCreateOpen(false);
            setGroupName("");
            setCreateCode("");
            message.success("组已创建并提交审核，审核通过后成员才能加入，请保存好邀请码");
            await refreshGroups();
            await setActiveGroup(group.id);
        } catch (error) {
            message.error(groupErrorMessage(error, "创建组失败"));
        } finally {
            setCreating(false);
        }
    };

    const handleSearch = async () => {
        if (!searchName.trim()) { message.warning("请输入要搜索的组名"); return; }
        setSearching(true);
        try { setResults(await searchGroups(searchName)); }
        catch (error) { message.error(groupErrorMessage(error, "搜索组失败")); }
        finally { setSearching(false); }
    };

    const handleJoinRequest = async () => {
        if (!joinGroup) return;
        if (!joinCode.trim()) { message.warning("请输入组长提供的邀请码"); return; }
        setJoining(true);
        try {
            await requestGroupMembership(joinGroup.id, joinCode);
            setJoinGroup(null);
            setJoinCode("");
            message.success("申请已提交，等待组长审批");
        } catch (error) {
            message.error(groupErrorMessage(error, "提交申请失败"));
        } finally {
            setJoining(false);
        }
    };

    const handleReview = async (application: GroupMembership, approve: boolean) => {
        try {
            await reviewGroupApplication(application.id || "", approve);
            setReloadKey((value) => value + 1);
            message.success(approve ? "已同意成员加入" : "已拒绝申请");
        } catch (error) { message.error(groupErrorMessage(error, "处理申请失败")); }
    };

    const handleRemove = (member: GroupMembership) => {
        modal.confirm({
            title: "移除组成员",
            content: "该成员将失去本组成员列表和共享画布的访问权限。",
            okText: "移除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: async () => {
                try {
                    await removeGroupMember(activeGroupId, member.user_id);
                    setReloadKey((value) => value + 1);
                } catch (error) { message.error(groupErrorMessage(error, "移除成员失败")); }
            },
        });
    };

    const handleLeaveGroup = () => {
        if (!selected || !user) return;
        modal.confirm({
            title: "退出组",
            content: "退出后将无法查看该组成员和画布，需要重新申请才能加入。",
            okText: "退出",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: async () => {
                try {
                    await removeGroupMember(selected.id, user.id);
                    message.success("已退出该组");
                    await refreshGroups();
                } catch (error) { message.error(groupErrorMessage(error, "退出组失败")); }
            },
        });
    };

    const handleDeleteGroup = () => {
        if (!selected) return;
        modal.confirm({
            title: "删除组",
            content: "删除后该组和邀请码将无法恢复，确认删除？",
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: async () => {
                try {
                    await deleteGroup(selected.id);
                    message.success("组已删除");
                    await refreshGroups();
                } catch (error) { message.error(groupErrorMessage(error, "删除组失败")); }
            },
        });
    };

    return (
        <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
                <section className="space-y-3 rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                    <div className="text-sm font-semibold">创建组</div>
                    <p className="text-xs text-stone-500">创建后你将成为组长，负责审批成员并维护组共享 API 配置。组需要平台管理员审核，通过后才会显示并可加入。</p>
                    <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>创建组</Button>
                </section>
                <section className="space-y-3 rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                    <div className="text-sm font-semibold">加入组</div>
                    <div className="flex gap-2">
                        <Input maxLength={80} value={searchName} onChange={(event) => setSearchName(event.target.value)} placeholder="搜索组名" onPressEnter={() => void handleSearch()} />
                        <Button icon={<Search className="size-4" />} loading={searching} onClick={() => void handleSearch()}>搜索</Button>
                    </div>
                    {results.length ? <div className="space-y-2">{results.map((group) => <div key={group.id} className="flex items-center gap-2 border-t border-stone-100 pt-2 dark:border-stone-800"><span className="min-w-0 flex-1 truncate text-sm">{group.name}</span><Button size="small" icon={<LogIn className="size-3.5" />} onClick={() => { setJoinGroup(group); setJoinCode(""); }}>申请加入</Button></div>)}</div> : <p className="text-xs text-stone-500">搜索组名后输入组长提供的邀请码申请加入。</p>}
                </section>
            </div>

            <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
                <section className="space-y-1">
                    <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                        <span>我的组</span>
                        <Button type="text" size="small" icon={<RefreshCw className="size-3.5" />} aria-label="刷新组" loading={groupsLoading} onClick={() => void refreshGroups().catch((error) => message.error(groupErrorMessage(error, "刷新组失败")))} />
                    </div>
                    {groups.map((group) => <button key={group.id} type="button" onClick={() => void selectGroup(group.id)} className={`flex w-full items-center gap-2 border-l-2 px-3 py-2 text-left text-sm transition ${activeGroupId === group.id ? "border-[#a21621] bg-black/[0.04] font-medium dark:bg-white/[0.06]" : "border-transparent hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"}`}><span className="min-w-0 flex-1 truncate">{group.name}</span>{group.access_status === "待审核" ? <Tag className="!m-0 shrink-0" color="processing">审核中</Tag> : group.access_status === "未通过" ? <Tag className="!m-0 shrink-0" color="red">未通过</Tag> : null}</button>)}
                    {!groups.length ? <p className="py-5 text-xs text-stone-500">暂未加入任何组</p> : null}
                </section>
                <Spin spinning={detailLoading || groupsLoading}>
                    {selected ? (
                        <div className="space-y-5">
                            <section className="space-y-3 border-b border-stone-200 pb-4 dark:border-stone-800">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 text-base font-semibold"><Users className="size-4" />{selected.name}</div>
                                    <div className="flex items-center gap-2">
                                        <Tag color={disabled ? "red" : pending ? "processing" : undefined}>{disabled ? "未通过" : pending ? "审核中" : isOwner ? "组长" : "成员"}</Tag>
                                        {isOwner && !notApproved ? <Button size="small" icon={<Settings2 className="size-3.5" />} onClick={() => setConfigOpen(true)}>组共享 API 配置</Button> : null}
                                        {!isOwner ? <Button size="small" onClick={() => setConfigOpen(true)}>查看 API 配置</Button> : null}
                                        {!isOwner ? <Button size="small" danger onClick={handleLeaveGroup}>退出组</Button> : null}
                                    </div>
                                </div>
                                <p className="text-xs text-stone-500">{isOwner ? "点击成员头像可打开组共享 API 配置；悬停成员名称可进入其只读画布。" : "API 配置由组长统一管理；悬停其他成员名称可进入其只读画布。"}</p>
                                <div className="space-y-2">
                                    {members.map((member) => {
                                        const self = member.user_id === user?.id;
                                        return (
                                            <div key={member.user_id} className="flex items-center gap-2 text-sm">
                                                <Tooltip title={isOwner ? "组共享 API 配置" : "查看成员信息"}>
                                                    <button type="button" onClick={() => (isOwner ? setConfigOpen(true) : setInfoMember(member))} className="grid size-7 shrink-0 place-items-center rounded-full bg-stone-100 text-xs transition hover:ring-2 hover:ring-[#a21621]/30 dark:bg-stone-800" aria-label={isOwner ? "打开组共享 API 配置" : "查看成员信息"}>
                                                        {(member.username || "?").slice(0, 1).toUpperCase()}
                                                    </button>
                                                </Tooltip>
                                                {self ? (
                                                    <span className="min-w-0 flex-1 truncate">{member.username || "组成员"}<span className="ml-1 text-xs text-stone-400">（我）</span></span>
                                                ) : (
                                                    <span className="min-w-0 flex-1">
                                                        <Popover
                                                            trigger="hover"
                                                            placement="top"
                                                            content={<Button size="small" type="primary" icon={<Eye className="size-3.5" />} onClick={() => navigate(`/canvas/member/${member.user_id}`)}>进入画布</Button>}
                                                        >
                                                            <button type="button" onClick={() => navigate(`/canvas/member/${member.user_id}`)} className="max-w-full truncate text-left transition hover:text-[#a21621] hover:underline">{member.username || "组成员"}</button>
                                                        </Popover>
                                                    </span>
                                                )}
                                                {member.role === "owner" ? <Tag className="!m-0">组长</Tag> : null}
                                                {isOwner && member.role !== "owner" ? <Button danger type="text" size="small" icon={<Trash2 className="size-3.5" />} aria-label="移除成员" onClick={() => handleRemove(member)} /> : null}
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>

                            {pending ? (
                                <section className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
                                    <div className="font-semibold">该组正在审核</div>
                                    <p className="text-xs leading-5">平台管理员通过后，其他用户才能搜索和申请加入，也才能发布共享画布和使用组配置。</p>
                                </section>
                            ) : null}

                            {disabled ? (
                                <section className="space-y-3 rounded-lg border border-red-200 bg-red-50/60 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-200">
                                    <div className="font-semibold">该组审核未通过</div>
                                    <p className="text-xs leading-5">其他用户无法看到该组，也不能申请加入。你可以删除后重新创建。</p>
                                    <Button danger onClick={handleDeleteGroup}>删除组</Button>
                                </section>
                            ) : null}

                            {!notApproved && isOwner ? (
                                <section className="space-y-2">
                                    <h3 className="text-sm font-semibold">待审批申请 <span className="text-stone-400">{applications.length}</span></h3>
                                    {applications.map((application) => (
                                        <div key={application.id} className="flex items-center gap-2 text-sm">
                                            <span className="min-w-0 flex-1 truncate">{application.username || "用户"}</span>
                                            <Button size="small" icon={<Check className="size-3.5" />} onClick={() => void handleReview(application, true)}>同意</Button>
                                            <Button danger type="text" size="small" icon={<X className="size-3.5" />} aria-label="拒绝申请" onClick={() => void handleReview(application, false)} />
                                        </div>
                                    ))}
                                    {!applications.length ? <p className="text-xs text-stone-500">暂无待处理申请</p> : null}
                                </section>
                            ) : null}

                        </div>
                    ) : <div className="flex min-h-52 items-center justify-center text-sm text-stone-500">选择或创建一个组</div>}
                </Spin>
            </div>

            <Modal open={createOpen} title="创建组" okText="创建" cancelText="取消" confirmLoading={creating} onOk={() => void handleCreate()} onCancel={() => setCreateOpen(false)}>
                <div className="space-y-4 pt-2">
                    <label className="block">
                        <span className="mb-1 block text-sm font-medium">组名</span>
                        <Input maxLength={80} value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="输入组名" />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-sm font-medium">邀请码</span>
                        <Input maxLength={80} value={createCode} onChange={(event) => setCreateCode(event.target.value)} placeholder="至少 8 位，提供给申请加入的人" />
                        <span className="mt-1 block text-xs text-stone-500">邀请码创建后不会再次展示，请自行保存。</span>
                    </label>
                </div>
            </Modal>

            <Modal open={Boolean(joinGroup)} title={`申请加入「${joinGroup?.name || ""}」`} okText="提交申请" cancelText="取消" confirmLoading={joining} onOk={() => void handleJoinRequest()} onCancel={() => setJoinGroup(null)}>
                <div className="space-y-3 pt-2">
                    <p className="text-xs text-stone-500">输入组长提供的邀请码，提交后由组长审批。</p>
                    <Input.Password maxLength={80} value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="邀请码" onPressEnter={() => void handleJoinRequest()} />
                </div>
            </Modal>

            <Modal open={Boolean(infoMember)} title="成员信息" footer={null} onCancel={() => setInfoMember(null)}>
                {infoMember ? (
                    <div className="space-y-3 pt-2 text-sm">
                        <div className="flex justify-between gap-3"><span className="text-stone-500">昵称</span><span>{infoMember.username || "组成员"}</span></div>
                        <div className="flex justify-between gap-3"><span className="text-stone-500">身份</span><span>{infoMember.role === "owner" ? "组长" : "成员"}</span></div>
                        <div className="flex justify-between gap-3"><span className="text-stone-500">加入时间</span><span>{infoMember.created_at ? new Date(infoMember.created_at).toLocaleString() : "未知"}</span></div>
                        {infoMember.user_id !== user?.id ? <Button block onClick={() => { setInfoMember(null); navigate(`/canvas/member/${infoMember.user_id}`); }}>进入成员画布</Button> : null}
                    </div>
                ) : null}
            </Modal>

            {selected ? <GroupApiConfigModal open={configOpen} groupId={selected.id} groupName={selected.name} readOnly={!isOwner} onClose={() => setConfigOpen(false)} /> : null}
        </div>
    );
}
