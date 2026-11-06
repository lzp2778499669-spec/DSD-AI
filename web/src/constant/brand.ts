// 品牌与入口配置。
// 品牌文案、Logo 和顶部入口是否显示都在这里改，不需要动界面代码。
export const brand = {
    name: "蝶讯",
    product: "AI-D.SD",
    title: "蝶讯智能设计系统",
    subtitle: "DICTION · AI DESIGN SYSTEM",
    logo: "/dsd-logo.svg",
    accent: "#ef1f1f",
};

// 顶部入口开关：false 表示隐藏，改成 true 即可恢复。
// 隐藏的入口只是不显示，代码和后台能力都还在。
export const topBarEntries = {
    language: true,
    shortcuts: true,
    credits: true,
    membership: true,
    avatar: true,
    // 原项目入口，默认隐藏。
    plugins: false,
    config: false,
    version: false,
    github: false,
    agent: false,
    docs: false,
};
