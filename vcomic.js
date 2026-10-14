class Vomicmh extends ComicSource {

    name = "vcomic"

    key = "vcomic"

    version = "1.2.0"

    minAppVersion = "1.5.0"

    static baseUrl = "https://vomicmh.com"
    static apiUrl = "https://api.vomicmh.com/pics"

    static ua = "Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36"

    async fetchPage(path, extraHeaders) {
        let headers = {
            "User-Agent": Vomicmh.ua,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            ...(extraHeaders || {})
        }
        let res = await Network.get(Vomicmh.baseUrl + path, headers)
        if (res.status !== 200) {
            throw new Error(`网络请求失败 (HTTP ${res.status})`)
        }
        return res.body
    }

    /**
     * 提取并拼接 Next.js RSC payload（self.__next_f.push 的全部 chunk）
     */
    getPayload(html) {
        let out = ""
        let re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g
        let m
        while ((m = re.exec(html)) !== null) {
            try {
                out += JSON.parse('"' + m[1] + '"')
            } catch (e) {
                // 忽略解码失败的 chunk
            }
        }
        return out
    }

    /**
     * 从 payload 中提取完整 JSON 对象（花括号匹配 + JSON.parse）
     * anchorRe: 定位对象起点的正则（需匹配 {"id":...,"name":"... 开头）
     */
    extractObjects(payload, anchorRe, filterFn) {
        let results = []
        let m
        let re = new RegExp(anchorRe.source, "g")
        while ((m = re.exec(payload)) !== null) {
            let start = m.index
            let obj = this.parseObjectAt(payload, start)
            if (obj !== null && filterFn(obj)) {
                results.push(obj)
            }
        }
        return results
    }

    /**
     * 从 start（必须是 '{' 位置）开始做花括号/方括号匹配，返回解析后的对象
     */
    parseObjectAt(payload, start) {
        let depth = 0
        let i = start
        let instr = false
        let esc = false
        while (i < payload.length) {
            let c = payload[i]
            if (esc) esc = false
            else if (c === "\\") esc = true
            else if (instr) {
                if (c === "\"") instr = false
            } else if (c === "\"") instr = true
            else if (c === "{") depth++
            else if (c === "}") {
                depth--
                if (depth === 0) {
                    try {
                        return JSON.parse(payload.slice(start, i + 1))
                    } catch (e) {
                        return null
                    }
                }
            }
            i++
        }
        return null
    }

    /**
     * 解析 RSC 引用 "$1d" → 查找行定义 "1d:[...]" 并解析
     */
    resolveRef(payload, ref) {
        if (!ref || !ref.startsWith("$")) return null
        let id = ref.slice(1)
        let re = new RegExp("(?:^|\\n)" + id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ":")
        let m = re.exec(payload)
        if (!m) return null
        let start = m.index + m[0].length
        let end = payload.indexOf("\n", start)
        if (end === -1) end = payload.length
        let jsonStr = payload.slice(start, end).trim()
        try {
            return JSON.parse(jsonStr)
        } catch (e) {
            return null
        }
    }

    /**
     * 提取列表页漫画对象（去重）
     */
    extractComics(payload) {
        let objs = this.extractObjects(
            payload,
            /\{"id":\d+,"name":"/,
            (o) => o && (o.chapter_num !== undefined || o.webCode !== undefined)
        )
        let map = new Map()
        for (let o of objs) {
            if (!map.has(o.id)) map.set(o.id, o)
        }
        return Array.from(map.values())
    }

    /**
     * 提取分页信息 {current, total, isLast, limit}
     */
    extractPagination(payload) {
        let m = /"current":"(\d+)","path":"[^"]*","total":(\d+),"isLast":(\w+),"limit":(\d+)/.exec(payload)
        if (!m) return null
        return {
            current: parseInt(m[1]),
            total: parseInt(m[2]),
            isLast: m[3] === "true",
            limit: parseInt(m[4]),
        }
    }

    parseComicItem(o) {
        let tags = []
        if (o.process && o.process.length > 0) tags.push(o.process)
        if (o.tags && typeof o.tags === "string") {
            for (let t of o.tags.split(/\s+/)) {
                if (t.length > 0) tags.push(t)
            }
        }
        return new Comic({
            id: String(o.id),
            title: o.name ?? "",
            subtitle: o.author ?? "",
            cover: o.cover ?? "",
            tags: tags,
            description: o.intro ?? "",
        })
    }

    /**
     * 去掉 script 后剥离 HTML 标签，返回纯文本（标签转为 |）
     */
    stripHtml(html) {
        let s = html.replace(/<script[\s\S]*?<\/script>/gi, "")
        s = s.replace(/<style[\s\S]*?<\/style>/gi, "")
        s = s.replace(/<[^>]+>/g, "|")
        return s
    }

    htmlUnescape(s) {
        return s
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&#x27;/g, "'")
    }

    // ------------------------------------------------------------------
    // 账号（阅读需要登录）
    // ------------------------------------------------------------------

    getToken() {
        return this.loadData("token")
    }

    /**
     * 带 Bearer token 的 API 请求头，未登录返回 null
     */
    authHeaders() {
        let token = this.getToken()
        if (!token) return null
        return {
            "User-Agent": Vomicmh.ua,
            "Authorization": `Bearer ${token}`,
        }
    }

    /**
     * 解析需登录 API 的响应，未登录/失效时抛 "Login expired"
     *（venera 约定：抛出该错误会自动尝试重新登录）
     */
    parseAuthResponse(res) {
        if (res.status === 401) throw "Login expired"
        let json
        try {
            json = JSON.parse(res.body)
        } catch (e) {
            throw new Error(`请求失败 (HTTP ${res.status})`)
        }
        if (json.code === 401) throw "Login expired"
        return json
    }

    account = {
        /**
         * 使用邮箱 + 密码登录
         * @param account {string} 邮箱
         * @param pwd {string} 密码
         */
        login: async (account, pwd) => {
            let res = await Network.post(
                `${Vomicmh.apiUrl}/login`,
                {
                    "Content-Type": "application/json",
                    "User-Agent": Vomicmh.ua,
                    "Origin": Vomicmh.baseUrl,
                    "Referer": Vomicmh.baseUrl + "/",
                },
                JSON.stringify({ email: account, password: pwd })
            )
            let json
            try {
                json = JSON.parse(res.body)
            } catch (e) {
                throw new Error(`登录失败 (HTTP ${res.status})`)
            }
            let token = json.token ?? (json.data ? json.data.token : null)
            if (res.status === 200 && json.code === 200 && token) {
                this.saveData("token", token)
                return "ok"
            }
            throw new Error(json.message || "登录失败，请检查邮箱与密码")
        },

        logout: () => {
            this.saveData("token", null)
        },

        registerWebsite: "https://member.vomicmh.com/",
    }

    // ------------------------------------------------------------------
    // 探索
    // ------------------------------------------------------------------

    explore = [
        {
            title: "vcomic",
            type: "multiPartPage",
            load: async (page) => {
                if (page > 1) return []
                let html = await this.fetchPage("/")
                let payload = this.getPayload(html)
                let comics = this.extractComics(payload).map((o) => this.parseComicItem(o))
                return [
                    {
                        title: "热门推荐",
                        comics: comics,
                    },
                ]
            },
        },
    ]

    // ------------------------------------------------------------------
    // 分类
    // ------------------------------------------------------------------

    category = {
        title: "分类",
        parts: [
            {
                name: "题材",
                type: "fixed",
                categories: [
                    "冒险", "搞笑", "动作", "科幻", "爱情", "侦探", "竞技", "魔法",
                    "校园", "百合", "耽美", "历史", "战争", "宅系", "治愈", "武侠",
                    "职场", "神鬼", "奇幻", "生活", "其他", "热血", "古风", "悬疑",
                    "都市", "架空", "青春", "剧情", "犯罪", "致郁", "纯爱", "恋爱",
                    "体育", "末世", "少女", "重生", "美食",
                ],
                categoryParams: [
                    "4", "5", "6", "7", "8", "9", "10", "11",
                    "12", "13", "14", "15", "16", "17", "18", "20",
                    "21", "22", "23", "24", "25", "26", "27", "28",
                    "29", "30", "31", "32", "34", "35", "36", "37",
                    "38", "39", "40", "41", "43",
                ],
                itemType: "category",
            },
        ],
        enableRankingPage: false,
    }

    categoryComics = {
        /**
         * 加载分类漫画列表
         * @param category {string}
         * @param param {string?} 分类 id
         * @param options {string[]}
         * @param page {number}
         */
        load: async (category, param, options, page) => {
            if (!param) param = "5"
            let html = await this.fetchPage(`/so/cate/${param}/${page}`)
            let payload = this.getPayload(html)
            let comics = this.extractComics(payload).map((o) => this.parseComicItem(o))
            let pag = this.extractPagination(payload)
            let maxPage = 1
            if (pag && pag.limit > 0) {
                maxPage = Math.max(1, Math.ceil(pag.total / pag.limit))
            }
            if (page > maxPage) maxPage = page
            return { comics: comics, maxPage: maxPage }
        },
    }

    // ------------------------------------------------------------------
    // 搜索
    // ------------------------------------------------------------------

    search = {
        load: async (keyword, options, page) => {
            let kw = encodeURIComponent(keyword.trim())
            if (kw.length === 0) {
                return { comics: [], maxPage: 1 }
            }
            let html = await this.fetchPage(`/so/key/${kw}/${page}`)
            let payload = this.getPayload(html)
            let comics = this.extractComics(payload).map((o) => this.parseComicItem(o))
            // 站点搜索的 total 字段恒为 12 不可信，使用自适应翻页：有结果则允许翻下一页
            let maxPage = comics.length > 0 ? Math.min(page + 1, 50) : page
            return { comics: comics, maxPage: maxPage }
        },
    }

    // ------------------------------------------------------------------
    // 网络收藏
    // ------------------------------------------------------------------

    favorites = {
        multiFolder: false,

        /**
         * 添加/移除收藏
         * API: POST /pics/c/collect {car_id, type: "add"|"delete"}
         * @param comicId {string}
         * @param folderId {string} 未使用（单收藏夹）
         * @param isAdding {boolean}
         * @param favoriteId {string?} 收藏记录 id（本站删除只需 car_id，未使用）
         */
        addOrDelFavorite: async (comicId, folderId, isAdding, favoriteId) => {
            let headers = this.authHeaders()
            if (!headers) throw "Login expired"
            let res = await Network.post(
                `${Vomicmh.apiUrl}/c/collect`,
                Object.assign({ "Content-Type": "application/json" }, headers),
                JSON.stringify({ car_id: parseInt(comicId), type: isAdding ? "add" : "delete" })
            )
            let json = this.parseAuthResponse(res)
            if (json.code !== 200) {
                throw new Error(json.message || (isAdding ? "收藏失败" : "移除收藏失败"))
            }
            return "ok"
        },

        /**
         * 加载网络收藏列表（最新收藏在前）
         * API: GET /pics/c/getMyCollectList?page=&limit=
         * @param page {number}
         * @param folder {string?} 未使用（单收藏夹）
         */
        loadComics: async (page, folder) => {
            let headers = this.authHeaders()
            if (!headers) throw "Login expired"
            let limit = 24
            let res = await Network.get(
                `${Vomicmh.apiUrl}/c/getMyCollectList?page=${page}&limit=${limit}`,
                headers
            )
            let json = this.parseAuthResponse(res)
            if (json.code !== 200) {
                throw new Error(json.message || "获取收藏列表失败")
            }
            let list = json.data ?? []
            let comics = list.map((e) => {
                let c = this.parseComicItem(e.cartoon ?? e)
                // 收藏记录 id，用于 App 显示收藏状态
                if (e.id !== undefined) c.favoriteId = String(e.id)
                return c
            })
            let total = json.total ?? comics.length
            let maxPage = Math.max(1, Math.ceil(total / limit))
            return { comics: comics, maxPage: maxPage }
        },
    }

    // ------------------------------------------------------------------
    // 漫画详情与阅读
    // ------------------------------------------------------------------

    comic = {
        /**
         * 加载漫画详情
         * @param id {string}
         */
        loadInfo: async (id) => {
            let html = await this.fetchPage(`/detail/${id}`)
            // 404 页面返回 200，特征：og:url 不指向 /detail/{id}
            let ogUrl = /<meta property="og:url" content="([^"]*)"/.exec(html)
            if (!ogUrl || ogUrl[1].indexOf(`/detail/${id}`) === -1) {
                throw new Error("漫画不存在或已下架")
            }
            let payload = this.getPayload(html)

            // 标题 / 封面 / 简介来自 og meta
            let title = ""
            let cover = ""
            let intro = ""
            let m = /<meta property="og:title" content="([^"]*)"/.exec(html)
            if (m) title = this.htmlUnescape(m[1]).replace(/\s*-\s*vomic漫\s*$/, "")
            m = /<meta property="og:image" content="([^"]*)"/.exec(html)
            if (m) cover = this.htmlUnescape(m[1])
            m = /<meta property="og:description" content="([^"]*)"/.exec(html)
            if (m) intro = this.htmlUnescape(m[1]).trim()

            // 作者 / 分类 / 标签来自页面可见文本（标签已剥离，| 为分隔）
            let text = this.stripHtml(html)
            let tokens = text.split("|").map((s) => s.trim()).filter((s) => s.length > 0)
            let findValue = (label) => {
                let i = tokens.indexOf(label)
                if (i === -1 || i + 1 >= tokens.length) return ""
                let v = tokens[i + 1]
                if (v.endsWith("：") || v.endsWith(":")) return ""
                return v
            }
            let author = findValue("作者：")
            let categoryName = findValue("分类：")
            // 标签：取 "标签：" 与 "简介：" 之间的所有 token
            let tags = []
            let ti = tokens.indexOf("标签：")
            if (ti !== -1) {
                let ii = tokens.indexOf("简介：", ti)
                let end = ii === -1 ? tokens.length : ii
                for (let j = ti + 1; j < end; j++) {
                    tags.push(tokens[j])
                }
            }

            // 连载状态来自 JSON-LD
            let status = ""
            m = /creativeWorkStatus\\?"?:?\s*\\?"?\s*([^,\\\n]+)/.exec(payload)
            if (m) status = m[1].trim()

            // 章节列表（RSC payload 中含 car_id 的对象）
            let chapters = {}
            let updateTime = ""
            let chapterObjs = this.extractObjects(
                payload,
                /\{"id":\d+,"name":"[^"]*","car_id":/,
                (o) => o && String(o.car_id) === String(id)
            )
            // 按 id 去重
            let chMap = new Map()
            for (let ch of chapterObjs) {
                if (!chMap.has(ch.id)) chMap.set(ch.id, ch)
            }
            let chList = Array.from(chMap.values())
            chList.sort((a, b) => {
                let sa = parseFloat(a.sort ?? "0")
                let sb = parseFloat(b.sort ?? "0")
                if (sa !== sb) return sa - sb
                return a.id - b.id
            })
            for (let ch of chList) {
                let chTitle = (ch.name ?? "").trim()
                if (chTitle.length === 0) chTitle = `第${Object.keys(chapters).length + 1}话`
                let group = (ch.group_name ?? "").trim()
                if (group.length > 0 && group !== "正篇") {
                    chTitle = `[${group}] ${chTitle}`
                }
                // ep_ 前缀防止纯数字 key 被 JS 对象按数值重排
                chapters[`ep_${ch.id}`] = chTitle
                let t = ch.updated_at ?? ch.chapter_updated_at ?? ""
                if (t > updateTime) updateTime = t
            }

            let tagsMap = {}
            if (author) tagsMap["作者"] = [author]
            if (categoryName) tagsMap["分类"] = [categoryName]
            if (tags.length > 0) tagsMap["标签"] = tags
            if (status) tagsMap["状态"] = [status]

            // 网络收藏状态（已登录时查询，失败不影响详情加载）
            let isFavorite = false
            let authHeaders = this.authHeaders()
            if (authHeaders) {
                try {
                    let res = await Network.get(
                        `${Vomicmh.apiUrl}/c/isCollect?car_id=${parseInt(id)}`,
                        authHeaders
                    )
                    let json = this.parseAuthResponse(res)
                    if (json.code === 200 && json.data !== "no") isFavorite = true
                } catch (e) { /* 忽略查询失败 */ }
            }

            return new ComicDetails({
                title: title,
                subtitle: author,
                cover: cover,
                description: intro,
                chapters: chapters,
                tags: tagsMap,
                updateTime: updateTime,
                isFavorite: isFavorite,
            })
        },

        /**
         * 加载章节图片（需要登录）
         * @param comicId {string}
         * @param epId {string}
         */
        loadEp: async (comicId, epId) => {
            epId = String(epId ?? "").replace(/^ep_/, "")
            let token = this.getToken()
            if (!token) {
                throw new Error("vomic漫需要登录后才能阅读：请在 [漫画源] -> [vomic漫] -> [登录] 中使用邮箱账号登录")
            }
            let html = await this.fetchPage(`/chapter/${comicId}/${epId}`, {
                "Cookie": `_token=${token}`,
            })
            let payload = this.getPayload(html)
            let images = this.extractChapterImages(payload)
            if (images.length === 0) {
                if (payload.indexOf('"isLogin":true') === -1) {
                    throw new Error("登录已失效或未登录：请退出账号后重新登录（网站需登录才能阅读）")
                }
                throw new Error("章节不存在或登录已失效：若反复出现请退出账号后重新登录")
            }
            // 默认剥离 imageMogr2 压缩参数以获取原图（签名仅覆盖 sign+t，实测可行）
            this._imgBackup = {}
            if (this.loadSetting("originalImage") !== false) {
                images = images.map((u) => {
                    let idx = u.indexOf("&imageMogr2")
                    if (idx === -1) return u
                    this._imgBackup[u.slice(0, idx)] = u
                    return u.slice(0, idx)
                })
            }
            return { images: images }
        },

        onImageLoad: async (url) => {
            return {
                // 原图加载失败时回退到签名压缩图（仅重试一次）
                onLoadFailed: (failedUrl) => {
                    let backup = this._imgBackup ? this._imgBackup[failedUrl] : null
                    if (backup) {
                        delete this._imgBackup[failedUrl]
                        return { url: backup }
                    }
                    return null
                },
            }
        },
    }

    /**
     * 从章节页 payload 提取图片列表
     * 章节数据形如: {"chapterData":{...}|"$ref","isLogin":bool,"chapterList":[...]|"$ref"}
     * chapterData.img_list 为数组或 "$ref" 引用，元素为 string 或 {url}
     */
    extractChapterImages(payload) {
        let m = /"chapterData":/.exec(payload)
        if (!m) return []
        let i = m.index + m[0].length
        while (i < payload.length && payload[i] === " ") i++
        let chapterData = null
        if (payload[i] === "{") {
            chapterData = this.parseObjectAt(payload, i)
        } else if (payload[i] === "\"") {
            // 读取 JSON 字符串值（可能是 "$ref"）
            let j = i + 1
            let sb = ""
            while (j < payload.length) {
                let c = payload[j]
                if (c === "\\") {
                    sb += payload[j + 1]
                    j += 2
                    continue
                }
                if (c === "\"") break
                sb += c
                j++
            }
            if (sb.startsWith("$")) {
                chapterData = this.resolveRef(payload, sb)
            }
        }
        if (!chapterData) return []
        let imgList = chapterData.img_list
        if (typeof imgList === "string" && imgList.startsWith("$")) {
            imgList = this.resolveRef(payload, imgList)
        }
        if (!Array.isArray(imgList)) return []
        let urls = []
        for (let item of imgList) {
            if (typeof item === "string" && item.length > 0) {
                urls.push(item)
            } else if (item && typeof item === "object" && typeof item.url === "string" && item.url.length > 0) {
                urls.push(item.url)
            }
        }
        return urls
    }

    // ------------------------------------------------------------------
    // 设置
    // ------------------------------------------------------------------

    settings = {
        checkLogin: {
            title: "检查登录状态",
            type: "callback",
            buttonText: "检查",
            callback: async () => {
                let token = this.loadData("token")
                if (!token) {
                    throw new Error("尚未登录")
                }
                let res = await Network.get(`${Vomicmh.apiUrl}/me`, {
                    "User-Agent": Vomicmh.ua,
                    "Authorization": `Bearer ${token}`,
                })
                let json = JSON.parse(res.body)
                if (json.code === 200 && json.data) {
                    return `当前登录：${json.data.name ?? json.data.email ?? "已登录"}`
                }
                throw new Error(json.message || "登录已失效，请重新登录")
            },
        },
        originalImage: {
            title: "加载原图（更高清晰度，关闭则使用站点默认压缩图）",
            type: "switch",
            default: true,
        },
    }
}