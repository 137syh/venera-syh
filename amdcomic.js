class AiManDao extends ComicSource {
    name = "爱漫岛";
    key = "aiman";
    version = "2.3.6";
    minAppVersion = "1.4.0";
    url = "https://137syh.github.io/venera-syh/amdcomic.js";

    settings = {
        domains: {
            title: "主域名",
            type: "select",
            options: [
                { value: "amdcomic-plus.vip", text: "大陆优化" },
                { value: "amdcomic.com", text: "主线路" },
                { value: "amdcomic.xyz", text: "备用线路" },
            ],
            default: "amdcomic-plus.vip",
        },
    };

    get baseUrl() {
        let domain = this.loadSetting("domains") || this.settings.domains.default;
        return `https://www.${domain}`;
    }

    static baseHeaders = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
        "Referer": "https://www.amdcomic-plus.vip/",
    };

    // 获取请求头（自动附带 cookies）
    getHeaders() {
        let headers = { ...AiManDao.baseHeaders };
        let cookies = this.loadData("cookies") || "";
        if (cookies.trim()) {
            headers["Cookie"] = cookies.trim();
        }
        return headers;
    }

    // 通用解析：从元素提取 Comic 对象
    parseComicFromElement(e) {
        let linkElem = e.querySelector("a.vodlist_thumb") || e.querySelector("div.searchlist_img a.vodlist_thumb") || e.querySelector("a");
        if (!linkElem) return null;
        let link = linkElem.attributes["href"];
        if (!link) return null;
        let idMatch = link.match(/\/(\d+)(?:\.html)?\/?$/);
        if (!idMatch) return null;
        let id = idMatch[1];

        let cover = linkElem.attributes["data-original"] || linkElem.attributes["src"] || "";
        let titleElem = e.querySelector("p.vodlist_title a, h4.vodlist_title a");
        let title = titleElem ? titleElem.text.trim() : "";
        if (!title) {
            titleElem = e.querySelector("div.ranklist_txt h4.title a") || e.querySelector("div.ranklist_txt h4.title");
            title = titleElem ? titleElem.text.trim() : "";
        }
        if (!title) {
            title = linkElem.attributes["title"] || "";
        }
        if (!title) {
            let subElem = e.querySelector("p.vodlist_sub");
            if (subElem) title = subElem.text.trim();
        }
        if (!title) return null;
        let subTitle = e.querySelector("p.vodlist_sub")?.text.trim() || "";
        return new Comic({ id, title, cover, subTitle });
    }

    // 从 HTML 中提取 player_aaaa JSON 对象
    extractPlayerAaaa(html) {
        let idx = html.indexOf("player_aaaa=");
        if (idx === -1) return null;
        let start = html.indexOf("{", idx);
        if (start === -1) return null;
        let depth = 0;
        let inStr = false;
        let esc = false;
        let end = start;
        for (let i = start; i < html.length; i++) {
            let c = html[i];
            if (esc) { esc = false; continue; }
            if (c === "\\") { esc = true; continue; }
            if (c === "\"") { inStr = !inStr; continue; }
            if (inStr) continue;
            if (c === "{") depth++;
            else if (c === "}") {
                depth--;
                if (depth === 0) { end = i + 1; break; }
            }
        }
        let raw = html.substring(start, end);
        try {
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    // 从 HTML 中提取 dom_string 列表
    extractDomStrings(html) {
        let doms = [];
        let re = /dom_string\s*=\s*'([^']+)'/g;
        let m;
        while ((m = re.exec(html)) !== null) {
            doms.push(m[1]);
        }
        return doms;
    }

    // 生成图片 URL 列表
    generateImageUrls(aid, totalPages, domains) {
        let images = [];
        let dom = domains.length > 0 ? domains[domains.length - 1] : "jm18c-may.net";
        for (let i = 1; i <= totalPages; i++) {
            let name = i.toString().padStart(5, "0");
            images.push(`https://cdn-msp.${dom}/media/photos/${aid}/${name}.webp`);
        }
        return images;
    }

    // 探索页面
    explore = [
        {
            title: this.name,
            type: "singlePageWithMultiPart",
            load: async () => {
                let res = await Network.get(this.baseUrl, this.getHeaders());
                if (res.status !== 200) throw `请求失败：${res.status}`;
                let doc = new HtmlDocument(res.body);
                let parts = doc.querySelectorAll("div.vod_row");
                let result = {};

                for (let part of parts) {
                    let titleElem = part.querySelector("div.pannel_head h2.title");
                    if (!titleElem) continue;
                    let partTitle = titleElem.text.trim();
                    let comics = part.querySelectorAll("li.vodlist_item")
                        .map(e => this.parseComicFromElement(e))
                        .filter(c => c !== null);
                    if (comics.length > 0) {
                        result[partTitle] = comics;
                    }
                }
                return result;
            },
            onThumbnailLoad: (url) => ({ url, headers: this.getHeaders() }),
        },
    ];

    // 分类
    category = {
        title: this.name,
        parts: [
            {
                name: "分类",
                type: "fixed",
                categories: ["同人", "单本", "短篇", "韩漫"],
                itemType: "category",
                categoryParams: ["1", "2", "3", "4"],
            },
        ],
        enableRankingPage: false,
    };

    // 分类漫画加载
    categoryComics = {
        // options: [子分类, 排序, 年份]
        optionList: [
            {
                label: "子分类",
                options: [
                    "-全部",
                    "6-校园",
                    "7-幻想",
                    "8-都市",
                    "9-搞笑",
                ],
            },
            {
                label: "排序",
                options: [
                    "time-最新",
                    "hits-最热",
                    "score-评分",
                ],
            },
            {
                label: "年份",
                options: [
                    "-全部",
                    "2025-2025",
                    "2024-2024",
                    "2023-2023",
                    "2022-2022",
                    "2021-2021",
                    "2020-2020",
                ],
            },
        ],

        load: async (category, param, options, page) => {
            let mainId = param || "1";
            let subId = options[0]?.split("-")[0] || "";
            let order = options[1]?.split("-")[0] || "time";
            let year = options[2]?.split("-")[0] || "";

            // 苹果CMS URL: /vodshow/{id}-{area}-{by}-{class}-{lang}-{letter}-{level}-{page}-{year}.html
            // 12个字段, 11个-分隔
            // [0]=id, [2]=order, [8]=page, [11]=year
            let id = subId || mainId;
            let fields = new Array(12).fill("");
            fields[0] = id;
            fields[2] = order;
            fields[8] = page > 1 ? page.toString() : "";
            fields[11] = year;

            let url = `${this.baseUrl}/vodshow/${fields.join("-")}.html`;

            let res = await Network.get(url, this.getHeaders());
            if (res.status !== 200) throw `分类请求失败：${res.status}`;
            let doc = new HtmlDocument(res.body);
            let comics = doc.querySelectorAll("li.vodlist_item")
                .map(e => this.parseComicFromElement(e))
                .filter(c => c !== null);

            let maxPage = 1;
            let pageLinks = doc.querySelectorAll("ul.page a");
            for (let a of pageLinks) {
                let href = a.attributes["href"];
                if (href && href.includes("/vodshow/")) {
                    let mid = href.replace(/\/vodshow\//, '').replace(/\.html$/, '');
                    let segs = mid.split('-');
                    for (let i = 1; i < segs.length; i++) {
                        let n = parseInt(segs[i]);
                        if (!isNaN(n) && n > maxPage && segs[i] === n.toString()) {
                            maxPage = n;
                        }
                    }
                }
            }
            let totalText = doc.querySelector("div.page_tips")?.text;
            if (totalText) {
                let match = totalText.match(/共有(\d+)页/);
                if (match) maxPage = parseInt(match[1]);
            }
            return { comics, maxPage };
        },
        onThumbnailLoad: (url) => ({ url, headers: this.getHeaders() }),
    };

    // 搜索
    search = {
        load: async (keyword, options, page) => {
            let encodedKeyword = encodeURIComponent(keyword);
            let url = `${this.baseUrl}/vodsearch/${encodedKeyword}----------${page}---/`;
            let res = await Network.get(url, this.getHeaders());
            if (res.status !== 200) throw `搜索失败：${res.status}`;
            let doc = new HtmlDocument(res.body);
            let comics = doc.querySelectorAll("li.searchlist_item")
                .map(e => {
                    let linkElem = e.querySelector("div.searchlist_img a.vodlist_thumb");
                    if (!linkElem) return null;
                    let link = linkElem.attributes["href"];
                    if (!link) return null;
                    let idMatch = link.match(/\/(\d+)(?:\.html)?\/?$/);
                    if (!idMatch) return null;
                    let id = idMatch[1];
                    let cover = linkElem.attributes["data-original"] || "";
                    let titleElem = e.querySelector("h4.vodlist_title a");
                    let title = titleElem ? titleElem.text.trim() : "";
                    let subTitle = e.querySelector("p.vodlist_sub")?.text.replace("主演：", "").trim() || "";
                    return new Comic({ id, title, cover, subTitle });
                })
                .filter(c => c !== null);

            let maxPage = 1;
            let pageLinks = doc.querySelectorAll("ul.page a");
            for (let a of pageLinks) {
                let href = a.attributes["href"];
                if (href && href.includes("/vodsearch/")) {
                    let match = href.match(/----------(\d+)---/);
                    if (match) {
                        let p = parseInt(match[1]);
                        if (p > maxPage) maxPage = p;
                    }
                }
            }
            let totalText = doc.querySelector("div.page_tips")?.text;
            if (totalText) {
                let match = totalText.match(/共有(\d+)页/);
                if (match) maxPage = parseInt(match[1]);
            }
            return { comics, maxPage };
        },
        onThumbnailLoad: (url) => ({ url, headers: this.getHeaders() }),
    };

    // 漫画详情
    comic = {
        loadInfo: async (id) => {
            if (!id) throw "漫画ID不能为空";
            let url = `${this.baseUrl}/voddetail/${id}/`;
            let res = await Network.get(url, this.getHeaders());
            if (res.status !== 200) throw `详情请求失败：${res.status}`;
            let doc = new HtmlDocument(res.body);

            let title = doc.querySelector("h2.title")?.text.trim() || "";
            let cover = doc.querySelector("div.content_thumb a.vodlist_thumb")?.attributes["data-original"] || "";
            let author = doc.querySelector("li.data a[href*='/vodsearch/-']")?.text.trim() || "未知";
            let tags = doc.querySelectorAll("li.c_roger a").map(a => a.text.trim()).filter(t => t);
            let descElem = doc.querySelector("div.content_desc span");
            let description = descElem ? descElem.text.trim() : "";

            let status = "";
            let updateTime = "";
            let dataItems = doc.querySelectorAll("li.data");
            for (let item of dataItems) {
                let text = item.text.trim();
                if (text.includes("状态：")) {
                    let match = text.match(/状态：(.+?)(?:\s*\/\s*(\d{2}-\d{2}))?$/);
                    if (match) {
                        status = match[1] || "";
                        updateTime = match[2] || "";
                    }
                    break;
                }
            }

            let chapters = new Map();
            let chapterLinks = doc.querySelectorAll("div.play_list_box ul.content_playlist li a");
            chapterLinks.forEach(a => {
                let href = a.attributes["href"];
                let name = a.text.trim();
                if (href && name) {
                    let fullHref = href.startsWith("http") ? href : `${this.baseUrl}${href}`;
                    if (!chapters.has(fullHref)) {
                        chapters.set(fullHref, name);
                    }
                }
            });

            if (chapters.size === 0) {
                let playSourceLinks = doc.querySelectorAll("div.play_source ul.content_playlist li a");
                playSourceLinks.forEach(a => {
                    let href = a.attributes["href"];
                    let name = a.text.trim();
                    if (href && name) {
                        let fullHref = href.startsWith("http") ? href : `${this.baseUrl}${href}`;
                        if (!chapters.has(fullHref)) {
                            chapters.set(fullHref, name);
                        }
                    }
                });
            }

            let recommend = doc.querySelectorAll("ul.vodlist.vodlist_sh li.vodlist_item, ul.vodlist.vodlist_sm li.vodlist_item")
                .map(e => this.parseComicFromElement(e))
                .filter(c => c !== null);

            // 检测是否已收藏：mac_ulog 按钮是否有 disabled class
            let isFavorite = false;
            let favBtn = doc.querySelector("a.mac_ulog");
            if (favBtn) {
                let className = favBtn.attributes["class"] || "";
                isFavorite = className.includes("disabled");
            }

            return new ComicDetails({
                title: title,
                cover: cover,
                description: description,
                tags: {
                    作者: [author],
                    标签: tags,
                    状态: [status],
                },
                chapters: chapters,
                recommend: recommend,
                updateTime: updateTime,
                isFavorite: isFavorite,
            });
        },
        onThumbnailLoad: (url) => ({ url, headers: this.getHeaders() }),

        loadEp: async (comicId, epId) => {
            let url = epId.startsWith("http") ? epId : `${this.baseUrl}${epId}`;
            let res = await Network.get(url, this.getHeaders());
            if (res.status !== 200) throw `章节请求失败：${res.status}`;
            let html = res.body;

            let playerData = this.extractPlayerAaaa(html);
            if (playerData && playerData.url) {
                try {
                    let inner = JSON.parse(playerData.url);
                    let aid = inner.aid;
                    let s2 = parseInt(inner.s2);
                    if (aid && s2 > 0) {
                        let doms = this.extractDomStrings(html);
                        let images = this.generateImageUrls(aid, s2, doms);
                        if (images.length > 0) return { images };
                    }
                } catch (e) {}
            }

            let doc = new HtmlDocument(html);
            let images = doc.querySelectorAll("img.lazy_img[data-original]").map(img => img.attributes["data-original"]).filter(url => url);
            if (images.length > 0) return { images };

            images = doc.querySelectorAll("img[data-original]").map(img => img.attributes["data-original"]).filter(url => url);
            if (images.length > 0) return { images };

            images = doc.querySelectorAll("div.center img[data-original]").map(img => img.attributes["data-original"]).filter(url => url);
            if (images.length > 0) return { images };

            let makePicMatch = html.match(/makePic\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*['"]([^'"]+)['"]\s*,\s*(\d+)\s*\)/);
            if (makePicMatch) {
                let numEnd = parseInt(makePicMatch[2]);
                let aid = makePicMatch[5];
                let doms = this.extractDomStrings(html);
                let images = this.generateImageUrls(aid, numEnd, doms);
                if (images.length > 0) return { images };
            }

            throw "未找到任何图片链接，可能页面结构已变化或需要登录";
        },
        onImageLoad: (url, comicId, epId) => ({
            url,
            headers: { ...this.getHeaders(), "Referer": epId },
        }),
    };

    // 账号登录（仅支持 cookies，因为 CF 拦截了账密登录接口）
    account = {
        loginWithCookies: {
            fields: ["cookies"],
            validate: async (cookies) => {
                let cookieStr = (cookies[0] || "").trim();
                if (!cookieStr) return false;
                let res = await Network.get(`${this.baseUrl}/index.php/user.html`, {
                    ...AiManDao.baseHeaders,
                    "Cookie": cookieStr,
                });
                if (res.status === 200 && (res.body.includes("会员中心") || res.body.includes("上次登录"))) {
                    this.saveData("cookies", cookieStr);
                    return true;
                }
                return false;
            },
        },
        logout: async () => {
            this.deleteData("cookies");
        },
    };

    favorites = {
        multiFolder: false,
        addOrDelFavorite: async (comicId, folderId, isAdding, favoriteId) => {
            if (isAdding) {
                // 添加收藏：GET /index.php/user/ajax_ulog/?ac=set&mid=1&id={id}&type=2
                let url = `${this.baseUrl}/index.php/user/ajax_ulog/?ac=set&mid=1&id=${encodeURIComponent(comicId)}&type=2`;
                let res = await Network.get(url, this.getHeaders());
                if (res.status !== 200) throw `操作失败：${res.status}`;
                let result;
                try {
                    result = JSON.parse(res.body);
                } catch (e) {
                    throw "响应解析失败";
                }
                if (result.code === 1 || result.msg === "ok") {
                    return "ok";
                } else {
                    throw result.msg || "操作失败";
                }
            } else {
                // 删除收藏：POST /index.php/user/ulog_del.html，参数 ids={id}&type=2&all=0
                let url = `${this.baseUrl}/index.php/user/ulog_del.html`;
                let headers = this.getHeaders();
                headers["Content-Type"] = "application/x-www-form-urlencoded";
                headers["X-Requested-With"] = "XMLHttpRequest";
                let body = `ids=${encodeURIComponent(comicId)}&type=2&all=0`;
                let res = await Network.post(url, headers, body);
                if (res.status !== 200) throw `删除失败：${res.status}`;
                let result;
                try {
                    result = JSON.parse(res.body);
                } catch (e) {
                    throw "响应解析失败: " + res.body.substring(0, 200);
                }
                if (result.code == 1 || result.msg === "ok") {
                    return "ok";
                } else {
                    throw result.msg || "删除失败";
                }
            }
        },
        loadFolders: async (comicId) => {
            let favorited = [];
            if (comicId) {
                // 检查该漫画是否已收藏：请求 favs.html 查找对应 ID
                let url = `${this.baseUrl}/index.php/user/favs.html`;
                let res = await Network.get(url, this.getHeaders());
                if (res.status === 200 && !res.body.includes("未登录")) {
                    let doc = new HtmlDocument(res.body);
                    let items = doc.querySelectorAll("ul.data__list li.data__item");
                    for (let item of items) {
                        let linkElem = item.querySelector("div.data__img a") || item.querySelector("a");
                        if (!linkElem) continue;
                        let link = linkElem.attributes["href"] || "";
                        let idMatch = link.match(/\/voddetail\/(\d+)\.html/);
                        if (idMatch && idMatch[1] === comicId) {
                            favorited.push("0");
                            break;
                        }
                    }
                }
            }
            return {
                folders: { "0": "全部" },
                favorited: favorited,
            };
        },
        loadComics: async (page, folder) => {
            // 使用 favs.html 页面解析收藏列表
            let url = `${this.baseUrl}/index.php/user/favs.html?page=${page}`;
            let res = await Network.get(url, this.getHeaders());
            if (res.status !== 200) throw `加载失败：${res.status}`;
            if (res.body.includes("login.html") || res.body.includes("未登录")) throw "Login expired";
            let doc = new HtmlDocument(res.body);
            // 解析 ul.data__list > li.data__item
            let items = doc.querySelectorAll("ul.data__list li.data__item");
            let comics = [];
            for (let item of items) {
                // 提取链接 /voddetail/195114.html
                let linkElem = item.querySelector("div.data__img a") || item.querySelector("div.data__txt h4 a") || item.querySelector("a");
                if (!linkElem) continue;
                let link = linkElem.attributes["href"] || "";
                let idMatch = link.match(/\/voddetail\/(\d+)\.html/);
                if (!idMatch) continue;
                let id = idMatch[1];
                // 提取标题
                let titleElem = item.querySelector("div.data__txt h4 a") || item.querySelector("h4 a");
                let title = titleElem ? (titleElem.text || "").trim() : "未知";
                // 提取封面
                let thumbElem = item.querySelector("div.data__img a");
                let cover = thumbElem ? (thumbElem.attributes["data-original"] || thumbElem.attributes["src"] || "") : "";
                // 提取备注信息
                let infoElems = item.querySelectorAll("div.data__txt p");
                let subTitle = "";
                for (let p of infoElems) {
                    let text = (p.text || "").trim();
                    if (text.includes("类型：")) {
                        subTitle = text.replace("类型：", "").trim();
                        break;
                    }
                }
                let comic = new Comic({
                    id: id,
                    title: title,
                    subTitle: subTitle,
                    cover: cover,
                    tags: [],
                    description: "",
                });
                comics.push(comic);
            }
            // 分页：查找 .member-page 中的页码
            let maxPage = 1;
            let pageElems = doc.querySelectorAll(".member-page a");
            for (let a of pageElems) {
                let text = (a.text || "").trim();
                let n = parseInt(text);
                if (!isNaN(n) && n > maxPage) maxPage = n;
            }
            return { comics: comics, maxPage: maxPage };
        },
    };
}