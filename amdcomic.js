class AiManDao extends ComicSource {
    name = "爱漫岛";
    key = "aiman";
    version = "2.0.0";
    minAppVersion = "1.4.0";
    url = "https://137syh.github.io/venera-syh/amdcomic.js";

    settings = {
        domains: {
            title: "主域名",
            type: "select",
            options: [
                { value: "amdcomic-plus.vip", text: "amdcomic-plus.vip" },
                { value: "amdcomic.xyz", text: "amdcomic.xyz" },
                { value: "amdcomic.com", text: "amdcomic.com" },
            ],
            default: "amdcomic-plus.vip",
        },
    };

    get baseUrl() {
        let domain = this.loadSetting("domains") || this.settings.domains.default;
        return `https://www.${domain}`;
    }

    static headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
        "Referer": "https://www.amdcomic-plus.vip/",
    };

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
                let res = await Network.get(this.baseUrl, AiManDao.headers);
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
            onThumbnailLoad: (url) => ({ url, headers: AiManDao.headers }),
        },
    ];

    // 分类 - 增强版：支持主分类、子分类、排序、年份
    category = {
        title: this.name,
        parts: [
            {
                name: "主分类",
                type: "fixed",
                categories: ["同人", "单本", "短篇", "韩漫"],
                itemType: "category",
                categoryParams: ["1", "2", "3", "4"],
            },
            {
                name: "子分类",
                type: "fixed",
                categories: ["全部", "校园", "幻想", "都市", "搞笑"],
                itemType: "subCategory",
                categoryParams: ["", "6", "7", "8", "9"],
            },
            {
                name: "排序",
                type: "fixed",
                categories: ["最新", "最热", "评分"],
                itemType: "order",
                categoryParams: ["time", "hits", "score"],
            },
            {
                name: "年份",
                type: "fixed",
                categories: ["全部", "2025", "2024", "2023", "2022", "2021", "2020"],
                itemType: "year",
                categoryParams: ["", "2025", "2024", "2023", "2022", "2021", "2020"],
            },
        ],
        enableRankingPage: false,
    };

    // 构建分类 URL
    buildCategoryUrl(mainId, subId, order, year, page) {
        let id = subId || mainId;
        let url = `${this.baseUrl}/vodshow/${id}`;
        if (order) {
            url += `--${order}`;
        } else {
            url += `--time`;
        }
        url += `--------`;
        if (year) {
            url += year;
        }
        if (page > 1) {
            url += `---${page}---`;
        }
        url += `.html`;
        return url;
    }

    // 分类漫画加载
    categoryComics = {
        load: async (category, param, options, page) => {
            let mainId = options["主分类"] || "1";
            let subId = options["子分类"] || "";
            let order = options["排序"] || "time";
            let year = options["年份"] || "";
            let url = this.buildCategoryUrl(mainId, subId, order, year, page);
            let res = await Network.get(url, AiManDao.headers);
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
                    let match = href.match(/---(\d+)---/);
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
        onThumbnailLoad: (url) => ({ url, headers: AiManDao.headers }),
    };

    // 搜索
    search = {
        load: async (keyword, options, page) => {
            let encodedKeyword = encodeURIComponent(keyword);
            let url = `${this.baseUrl}/vodsearch/${encodedKeyword}----------${page}---/`;
            let res = await Network.get(url, AiManDao.headers);
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
        onThumbnailLoad: (url) => ({ url, headers: AiManDao.headers }),
    };

    // 漫画详情
    comic = {
        loadInfo: async (id) => {
            if (!id) throw "漫画ID不能为空";
            let url = `${this.baseUrl}/voddetail/${id}/`;
            let res = await Network.get(url, AiManDao.headers);
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
            });
        },
        onThumbnailLoad: (url) => ({ url, headers: AiManDao.headers }),

        loadEp: async (comicId, epId) => {
            let url = epId.startsWith("http") ? epId : `${this.baseUrl}${epId}`;
            let res = await Network.get(url, AiManDao.headers);
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
            headers: { ...AiManDao.headers, "Referer": epId },
        }),
    };

    // 账号登录
    account = {
        login: async (account, pwd) => {
            let url = `${this.baseUrl}/index.php/user/ajax_login.html`;
            let body = `user_name=${encodeURIComponent(account)}&user_pwd=${encodeURIComponent(pwd)}`;
            let res = await Network.post(url, {
                ...AiManDao.headers,
                "Content-Type": "application/x-www-form-urlencoded",
                "X-Requested-With": "XMLHttpRequest",
            }, body);
            if (res.status !== 200) {
                throw `登录请求失败：${res.status}`;
            }
            let result;
            try {
                result = JSON.parse(res.body);
            } catch (e) {
                throw "登录响应解析失败";
            }
            if (result.code === 1 || result.msg === "登录成功") {
                let cookies = res.headers["set-cookie"] || res.headers["Set-Cookie"] || [];
                if (typeof cookies === "string") cookies = [cookies];
                this.saveData("cookies", cookies.join("; "));
                return true;
            } else {
                throw result.msg || "登录失败";
            }
        },
        logout: async () => {
            this.deleteData("cookies");
        },
        checkLogin: async () => {
            let cookies = this.loadData("cookies");
            if (!cookies) return false;
            let url = `${this.baseUrl}/index.php/user.html`;
            let res = await Network.get(url, {
                ...AiManDao.headers,
                "Cookie": cookies,
            });
            return res.status === 200 && !res.body.includes("登录") && !res.body.includes("login");
        },
    };

    favorites = null;
}