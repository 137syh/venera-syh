class NiaoNiaoHanMan extends ComicSource {
    name = "鸟鸟韩漫";
    key = "nnhm";
    version = "1.3.0";
    minAppVersion = "1.5.0";
    url = "https://137syh.github.io/venera-syh/nnhm.js";

    settings = {
        domains: {
            title: "主域名",
            type: "select",
            options: [
                { value: "nnhm2.com", text: "nnhm2.com" },
                { value: "nnhm5.com", text: "nnhm5.com" },
                { value: "nnhm6.com", text: "nnhm6.com" },
                { value: "nnhm7.com", text: "nnhm7.com" },
                { value: "nnhm8.com", text: "nnhm8.com" },
                { value: "nnhm9.com", text: "nnhm9.com" },
                { value: "nnhm81.com", text: "nnhm81.com" },
                { value: "nnhm91.com", text: "nnhm91.com" },
                { value: "nnhm92.com", text: "nnhm92.com" },
                { value: "nnhm93.com", text: "nnhm93.com" },
                { value: "nnhm95.com", text: "nnhm95.com" },
                { value: "nnhm5.org", text: "nnhm5.org" },
                { value: "nnhm7.org", text: "nnhm7.org" },
                { value: "nnhm3.xyz", text: "nnhm3.xyz" },
                { value: "nnhm5.xyz", text: "nnhm5.xyz" },
                { value: "nnhm6.xyz", text: "nnhm6.xyz" },
                { value: "nnhm7.xyz", text: "nnhm7.xyz" },
                { value: "nnhm8.xyz", text: "nnhm8.xyz" },
                { value: "nnhanman2.com", text: "nnhanman2.com" },
                { value: "nnhanman3.com", text: "nnhanman3.com" },
                { value: "nnhanman5.com", text: "nnhanman5.com" },
                { value: "nnhanman6.com", text: "nnhanman6.com" },
                { value: "nnhanman7.com", text: "nnhanman7.com" },
                { value: "nnhanman8.com", text: "nnhanman8.com" },
                { value: "nnhanman9.com", text: "nnhanman9.com" },
                { value: "nnhanman66.com", text: "nnhanman66.com" },
                { value: "nnhanman88.com", text: "nnhanman88.com" },
                { value: "nnhanman.org", text: "nnhanman.org" }
            ],
            default: "nnhm7.com"
        }
    };

    get baseUrl() {
        return `https://${this.loadSetting("domains")}`;
    }

    async fetchDoc(url) {
        const res = await Network.get(url, {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        });
        if (res.status !== 200) throw `请求失败: ${res.status}`;
        return new HtmlDocument(res.body);
    }

    // 解析首页、分类、搜索页的卡片（col_3_1 布局）
    parseComicItem(li) {
        let cover = "";
        const sourceElem = li.querySelector("a.ImgA picture source");
        if (sourceElem) cover = sourceElem.attributes?.srcset || "";
        if (!cover) {
            const imgElem = li.querySelector("a.ImgA img");
            cover = imgElem?.attributes?.src || "";
        }
        if (!cover) {
            const imgElem = li.querySelector("a.ImgA img");
            cover = imgElem?.attributes?.["data-src"] || "";
        }
        if (cover && !cover.startsWith("http")) {
            if (cover.startsWith("//")) cover = "https:" + cover;
            else if (cover.startsWith("/")) cover = this.baseUrl + cover;
            else cover = this.baseUrl + "/" + cover;
        }

        const titleElem = li.querySelector("a.txtA");
        const title = titleElem?.text?.trim() || "";
        const detailUrl = titleElem?.attributes?.href || "";
        const id = detailUrl.split("/").pop()?.replace(".html", "") || "";
        const infoElem = li.querySelector("span.info");
        let subTitle = "";
        if (infoElem) {
            const chapterLink = infoElem.querySelector("a");
            subTitle = chapterLink ? chapterLink.text.trim() : infoElem.text.trim();
        }

        return new Comic({
            id: id,
            title: title,
            cover: cover,
            subTitle: subTitle,
            description: "",
        });
    }

    // 解析排行榜、更新页、新书发布页的条目（itemBox 布局）
    parseListItem(item) {
        // 封面提取
        const img = item.querySelector(".itemImg picture source, .itemImg img");
        let cover = img?.attributes?.srcset || img?.attributes?.src || "";
        if (cover && !cover.startsWith("http")) {
            if (cover.startsWith("//")) cover = "https:" + cover;
            else if (cover.startsWith("/")) cover = this.baseUrl + cover;
            else cover = this.baseUrl + "/" + cover;
        }
        // 标题
        const titleElem = item.querySelector(".itemTxt .title");
        const title = titleElem?.text?.trim() || "";
        const detailUrl = titleElem?.attributes?.href || "";
        const id = detailUrl.split("/").pop()?.replace(".html", "") || "";
        // 最新章节
        const chapterElem = item.querySelector(".txtItme a");
        const chapter = chapterElem ? chapterElem.text.trim() : "";
        // 标签
        const tags = item.querySelectorAll(".pd a").map(a => a.text.trim()).join(", ");
        // 日期
        const dateElem = item.querySelector(".date");
        const date = dateElem ? dateElem.text.trim() : "";
        return new Comic({
            id: id,
            title: title,
            cover: cover,
            subTitle: chapter,
            description: `标签: ${tags}\n日期: ${date}`,
        });
    }

    // ==================== 探索页（首页） ====================
    explore = [
        {
            title: "鸟鸟韩漫",
            type: "multiPartPage",
            load: async (page) => {
                if (page > 1) return [];
                const doc = await this.fetchDoc(this.baseUrl);
                const allBoxes = doc.querySelectorAll("div.imgBox");
                const sections = [];

                const paramMap = {
                    "最近更新": "update",
                    "新书发布": "newbook",
                    "热门漫画": "ranking",
                    "推荐漫画": "recommend",
                    "已完结": "completed"
                };

                for (let box of allBoxes) {
                    const titleElem = box.querySelector(".Sub_H2 .Title, h2");
                    if (!titleElem) continue;
                    const titleText = titleElem.text.trim();
                    if (paramMap[titleText]) {
                        const items = box.querySelectorAll("ul.col_3_1 li");
                        if (items.length > 0) {
                            const comics = items.map(li => this.parseComicItem(li));
                            sections.push({
                                title: titleText,
                                comics: comics,
                                viewMore: {
                                    page: "category",
                                    attributes: {
                                        category: titleText,
                                        param: paramMap[titleText]
                                    }
                                }
                            });
                        }
                    }
                }
                doc.dispose();
                return sections;
            }
        }
    ];

    // ==================== 分类页 ====================
    category = {
        title: "鸟鸟韩漫",
        parts: [
            {
                name: "题材",
                type: "fixed",
                categories: [
                    "全部", "正妹", "恋爱", "出版漫画", "肉慾", "浪漫", "大尺度", "巨乳", "有夫之婦",
                    "女大生", "狗血劇", "同居", "好友", "調教", "动作", "後宮", "不倫", "3D",
                    "校園", "耽美", "日漫"
                ],
                categoryParams: [
                    "all", "正妹", "恋爱", "出版漫画", "肉慾", "浪漫", "大尺度", "巨乳", "有夫之婦",
                    "女大生", "狗血劇", "同居", "好友", "調教", "动作", "後宮", "不倫", "3D",
                    "校園", "耽美", "日漫"
                ],
                itemType: "category"
            },
            {
                name: "排行榜",
                type: "fixed",
                categories: ["排行榜"],
                categoryParams: ["ranking"],
                itemType: "category"
            },
            {
                name: "最近更新",
                type: "fixed",
                categories: ["最近更新"],
                categoryParams: ["update"],
                itemType: "category"
            },
            {
                name: "新书发布",
                type: "fixed",
                categories: ["新书发布"],
                categoryParams: ["newbook"],
                itemType: "category"
            },
            {
                name: "推荐漫画",
                type: "fixed",
                categories: ["推荐漫画"],
                categoryParams: ["recommend"],
                itemType: "category"
            },
            {
                name: "已完结",
                type: "fixed",
                categories: ["已完结"],
                categoryParams: ["completed"],
                itemType: "category"
            }
        ],
        enableRankingPage: false
    };

    // ==================== 分类漫画加载 ====================
    categoryComics = {
        load: async (category, param, options, page) => {
            // 排行榜处理（增加日志输出）
            if (param === "ranking") {
                const rankType = options[0] || "all";
                const url = `${this.baseUrl}/ranking/${rankType}`;
                console.log(`[排行榜] 请求URL: ${url}`); // 日志输出，便于调试
                const doc = await this.fetchDoc(url);
                const items = doc.querySelectorAll(".UpdateList .itemBox");
                console.log(`[排行榜] 解析到 ${items.length} 个条目`); // 日志输出
                const comics = items.map(item => this.parseListItem(item));
                doc.dispose();
                return { comics, maxPage: 1 };
            }
            if (param === "update") {
                let url = `${this.baseUrl}/update`;
                if (page > 1) url += `/page/${page}`;
                return this.loadItemBoxPage(url);
            }
            if (param === "newbook") {
                let url = `${this.baseUrl}/update/newbook`;
                if (page > 1) url += `/page/${page}`;
                return this.loadItemBoxPage(url);
            }
            if (param === "recommend") {
                let url = `${this.baseUrl}/update/recommend`;
                if (page > 1) url += `/page/${page}`;
                return this.loadItemBoxPage(url);
            }
            if (param === "completed") {
                const sort = options[0] || "time";
                const status = "completed";
                let url = `${this.baseUrl}/comics/all/ob/${sort}/st/${status}`;
                if (page > 1) url += `/page/${page}`;
                const doc = await this.fetchDoc(url);
                const comics = doc.querySelectorAll(".imgBox ul.col_3_1 li").map(li => this.parseComicItem(li));
                const maxPage = this.parseMaxPage(doc);
                doc.dispose();
                return { comics, maxPage };
            }

            // 普通分类
            const sort = options[0] || "time";
            const status = options[1] || "all";
            let url;
            if (param === "all") {
                url = `${this.baseUrl}/comics/all/ob/${sort}/st/${status}`;
            } else {
                url = `${this.baseUrl}/comics/${encodeURIComponent(param)}/ob/${sort}/st/${status}`;
            }
            if (page > 1) url += `/page/${page}`;

            const doc = await this.fetchDoc(url);
            const comics = doc.querySelectorAll(".imgBox ul.col_3_1 li").map(li => this.parseComicItem(li));
            const maxPage = this.parseMaxPage(doc);
            doc.dispose();
            return { comics, maxPage };
        },

        optionList: [
            {
                label: "排序",
                options: ["time-按时间", "hits-按热度"]
            },
            {
                label: "状态",
                options: ["all-全部", "completed-已完结", "serialized-连载中"]
            }
        ],

        optionLoader: async (category, param) => {
            if (param === "ranking") {
                return [{
                    label: "榜单类型",
                    options: [
                        "all-总榜",
                        "monthly-月榜",
                        "weekly-周榜",
                        "daily-日榜"
                    ]
                }];
            }
            if (["update", "newbook", "recommend", "completed"].includes(param)) {
                return [];
            }
            return [];
        }
    };

    // 辅助：加载 itemBox 布局的页面并解析分页
    async loadItemBoxPage(url) {
        const doc = await this.fetchDoc(url);
        const items = doc.querySelectorAll(".UpdateList .itemBox");
        const comics = items.map(item => this.parseListItem(item));
        const maxPage = this.parseMaxPage(doc);
        doc.dispose();
        return { comics, maxPage };
    }

    // 辅助：解析分页最大页码
    parseMaxPage(doc) {
        let maxPage = 1;
        const pagination = doc.querySelector(".pagination-wrap nav ul");
        if (pagination) {
            const links = pagination.querySelectorAll("li a");
            for (let link of links) {
                const href = link.attributes.href || "";
                const match = href.match(/page\/(\d+)/) || href.match(/[?&]page=(\d+)/);
                if (match) {
                    const p = parseInt(match[1]);
                    if (!isNaN(p) && p > maxPage) maxPage = p;
                }
            }
        }
        return maxPage;
    }

    // ==================== 搜索 ====================
    search = {
        load: async (keyword, options, page) => {
            const url = `${this.baseUrl}/catalog.php?key=${encodeURIComponent(keyword)}&page=${page}`;
            const doc = await this.fetchDoc(url);
            const comics = doc.querySelectorAll(".imgBox ul.col_3_1 li").map(li => this.parseComicItem(li));
            const maxPage = this.parseMaxPage(doc);
            doc.dispose();
            return { comics, maxPage };
        },
        enableTagsSuggestions: false
    };

    // ==================== 漫画详情 ====================
    comic = {
        loadInfo: async (id) => {
            const url = `${this.baseUrl}/comic/${id}.html`;
            const doc = await this.fetchDoc(url);

            const titleElem = doc.querySelector(".sub_r h1");
            const title = titleElem?.text?.trim() || "";

            const coverElem = doc.querySelector(".pic picture img, .pic img");
            let cover = coverElem?.attributes?.src || "";
            if (cover && !cover.startsWith("http")) {
                if (cover.startsWith("//")) cover = "https:" + cover;
                else if (cover.startsWith("/")) cover = this.baseUrl + cover;
                else cover = this.baseUrl + "/" + cover;
            }

            const authorElem = doc.querySelectorAll(".sub_r .txtItme")[1];
            const author = authorElem?.text?.replace("M16&", "").trim() || "";

            const tags = [];
            const tagLinks = doc.querySelectorAll(".sub_r .txtItme a");
            for (let a of tagLinks) {
                const text = a.text.trim();
                if (text && !text.includes("M16")) tags.push(text);
            }

            const dateElem = doc.querySelector(".sub_r .txtItme .date");
            const updateTime = dateElem?.text?.trim() || "";

            const descElem = doc.querySelector("p.txtDesc");
            const description = descElem?.text?.replace("介绍:", "").trim() || "";

            const chapters = {};
            const chapterLinks = doc.querySelectorAll("#mh-chapter-list-ol-0 li a");
            const reversedLinks = Array.from(chapterLinks).reverse();
            for (let a of reversedLinks) {
                const href = a.attributes.href || "";
                const chapterTitle = a.text.trim();
                const match = href.match(/chapter-(\d+)\.html/);
                if (match) {
                    const epId = match[1];
                    chapters[epId] = chapterTitle;
                }
            }

            const recommend = [];
            const recommendItems = doc.querySelectorAll(".imgBox ul.col_3_1 li");
            for (let li of recommendItems) {
                const comic = this.parseComicItem(li);
                if (comic.id) recommend.push(comic);
            }

            doc.dispose();
            return new ComicDetails({
                title: title,
                cover: cover,
                description: description,
                tags: {
                    "作者": author ? [author] : [],
                    "题材": tags,
                    "状态": updateTime ? [updateTime] : []
                },
                chapters: chapters,
                recommend: recommend,
                updateTime: updateTime,
                url: url
            });
        },

        loadEp: async (comicId, epId) => {
            const url = `${this.baseUrl}/comic/${comicId}/chapter-${epId}.html`;
            const doc = await this.fetchDoc(url);

            const images = [];
            // 兼容新旧两种图片标记：
            // 旧版: img.lazy[data-original]
            // 新版: .view-imgBox img[data-src]（无 lazy class）
            const imgNodes = doc.querySelectorAll(
                "#currentCache .view-imgBox img, .view-imgBox img, img.lazy"
            );
            for (let img of imgNodes) {
                let imgUrl =
                    img.attributes["data-original"] ||
                    img.attributes["data-src"] ||
                    img.attributes["src"];
                if (imgUrl) {
                    imgUrl = imgUrl.trim();
                    if (imgUrl.startsWith("//")) imgUrl = "https:" + imgUrl;
                    else if (imgUrl.startsWith("/")) imgUrl = this.baseUrl + imgUrl;
                    // 过滤占位图/加载动画
                    if (/loading|spinner|placeholder|\.gif$/i.test(imgUrl) && !/upload/i.test(imgUrl)) continue;
                    if (!images.includes(imgUrl)) images.push(imgUrl);
                }
            }

            if (images.length === 0) {
                doc.dispose();
                throw "本章未找到图片";
            }

            doc.dispose();
            return {
                images: images,
                headers: {
                    "Referer": url,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
            };
        }
    };
}