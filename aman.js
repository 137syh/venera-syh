class AMan8 extends ComicSource {

    name = "A漫"

    key = "aman8"

    version = "1.0.0"

    minAppVersion = "1.6.0"

    url = "https://aman8.org/"

    static baseHost = "aman8.org"

    static ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    get baseUrl() {
        return `https://${AMan8.baseHost}`
    }

    get baseHeaders() {
        return {
            "User-Agent": AMan8.ua,
            "Referer": `${this.baseUrl}/`,
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        }
    }

    get imgHeaders() {
        return {
            "User-Agent": AMan8.ua,
            "Referer": `${this.baseUrl}/`,
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        }
    }

    /**
     * 请求 HTML 页面
     * @param url {string}
     * @returns {Promise<string>}
     */
    async get(url) {
        let res = await Network.get(url, this.baseHeaders)
        if (res.status !== 200) {
            throw `Invalid status code: ${res.status}`
        }
        return res.body
    }

    /**
     * 从 HTML 字符串中提取第一个匹配 pattern 的捕获组（用于正则解析，避免依赖 Html.parse）
     * @param html {string}
     * @param pattern {RegExp}
     * @returns {string}
     */
    matchFirst(html, pattern) {
        let m = html.match(pattern)
        return m ? m[1] : ""
    }

    /**
     * 从列表页 HTML 解析漫画列表（正则解析）
     * 列表项形如：
     * <a class="hl-item-thumb hl-lazy" href="/manhuaview/458625.html" target="_blank" title="渴望：爱火难耐" data-original="https://p4.nnpic.xyz/...webp">
     * @param html {string}
     * @returns {Comic[]}
     */
    parseComicList(html) {
        let comics = []
        // 匹配整个 li 项，确保封面与标题对应
        let itemRe = /<li[^>]*class="[^"]*hl-list-item[^"]*"[^>]*>([\s\S]*?)<\/li>/g
        let m
        while ((m = itemRe.exec(html)) !== null) {
            let block = m[1]
            let hrefM = block.match(/href="(\/manhuaview\/\d+\.html)"/)
            if (!hrefM) continue
            let id = hrefM[1].replace("/manhuaview/", "").replace(".html", "")
            let titleM = block.match(/title="([^"]*)"/)
            let title = titleM ? titleM[1] : id
            let coverM = block.match(/data-original="([^"]*)"/)
            let cover = coverM ? coverM[1] : ""
            let subM = block.match(/class="hl-item-sub[^"]*"[^>]*>([\s\S]*?)</)
            let subTitle = subM ? subM[1].trim() : ""
            comics.push(new Comic({
                id: id,
                title: title,
                subTitle: subTitle,
                cover: cover,
                tags: [],
            }))
        }
        return comics
    }

    /**
     * 从列表页 HTML 解析最大页数
     */
    parseMaxPage(html) {
        // 优先：hl-page-total 直接给出 "1 / 110页"
        let m = html.match(/hl-page-total[^>]*>[\s\S]*?(\d+)\s*页/)
        if (m) {
            let n = parseInt(m[1])
            if (!isNaN(n) && n > 0) return n
        }
        // 其次：总数 / 每页24
        m = html.match(/hl-total[^>]*>(\d+)</)
        if (m) {
            let total = parseInt(m[1])
            if (!isNaN(total)) {
                return Math.max(1, Math.ceil(total / 24))
            }
        }
        // 兜底：分页链接中的最大页码
        let max = 1
        let pageRe = /page\/(\d+)/g
        while ((m = pageRe.exec(html)) !== null) {
            let n = parseInt(m[1])
            if (n > max) max = n
        }
        return max
    }

    // explore 首页板块
    explore = [
        {
            title: "A漫",
            type: "multiPartPage",
            load: async (page) => {
                let html = await this.get(`${this.baseUrl}/`)
                let result = []

                // banner 推荐：ul.hl-br-list 下 li a.hl-br-thumb
                let bannerItems = html.match(/<a[^>]*class="[^"]*hl-br-thumb[^"]*"[^>]*href="(\/manhuaview\/\d+\.html)"[^>]*title="([^"]*)"[^>]*>/g) || []
                let bannerComics = []
                for (let a of bannerItems) {
                    let hm = a.match(/href="(\/manhuaview\/\d+\.html)"/)
                    let tm = a.match(/title="([^"]*)"/)
                    let cm = a.match(/data-original="([^"]*)"/)
                    if (!hm) continue
                    let id = hm[1].replace("/manhuaview/", "").replace(".html", "")
                    bannerComics.push(new Comic({
                        id: id,
                        title: tm ? tm[1] : id,
                        subTitle: "",
                        cover: cm ? cm[1] : "",
                        tags: [],
                    }))
                }
                if (bannerComics.length > 0) {
                    result.push({
                        title: "轮播推荐",
                        comics: bannerComics,
                        viewMore: "category:全部@all",
                    })
                }

                // 首页各板块：div.hl-rb-vod，内部 h2.hl-rb-title a（板块标题）+ ul.hl-vod-list 列表
                let boxRe = /<div class="hl-rb-vod[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/g
                let bm
                while ((bm = boxRe.exec(html)) !== null) {
                    let box = bm[1]
                    let titleM = box.match(/<h2[^>]*class="hl-rb-title"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/)
                    if (!titleM) continue
                    let partTitle = titleM[1].replace(/<[^>]+>/g, "").trim()
                    // 从板块块中取 li 项（复用 parseComicList 的正则）
                    let comics = this.parseComicList(box)
                    if (comics.length === 0) continue
                    let viewMore = null
                    let moreM = box.match(/<a[^>]*class="hl-rb-more[^"]*"[^>]*href="([^"]*)"/)
                    if (moreM) {
                        let href = moreM[1]
                        if (href === "/booktop") viewMore = "category:排行榜@booktop"
                        else if (href === "/nbook") viewMore = "category:最新@nbook"
                        else if (href === "/bookcata") viewMore = "category:全部@all"
                    }
                    result.push({
                        title: partTitle,
                        comics: comics,
                        viewMore: viewMore,
                    })
                }

                if (result.length === 0) {
                    // 兜底：整个页面所有列表
                    let comics = this.parseComicList(html)
                    if (comics.length > 0) {
                        result.push({ title: "全部漫画", comics: comics })
                    }
                }
                return result
            }
        }
    ]

    // 分类
    category = {
        title: "A漫",
        parts: [
            {
                name: "漫画分类",
                type: "fixed",
                categories: ["全部", "韩漫", "日漫", "3D漫画", "美女", "单本"],
                categoryParams: ["all", "韩漫", "日漫", "3D漫画", "美女", "单本"],
                itemType: "category",
            },
            {
                name: "进度",
                type: "fixed",
                categories: ["全部", "已完结", "更新中"],
                categoryParams: ["all", "completed", "serialized"],
                itemType: "category",
            },
            {
                name: "排行榜",
                type: "fixed",
                categories: ["周榜", "日榜", "月榜", "总榜"],
                categoryParams: ["weekly", "daily", "monthly", "all"],
                itemType: "category",
            },
            {
                name: "最新",
                type: "fixed",
                categories: ["最新更新", "新书发布", "推荐漫画"],
                categoryParams: ["nbook", "nbook/nb", "nbook/recommend"],
                itemType: "category",
            },
        ],
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let url
            // 排行（注意：param "all" 与分类"全部"冲突，必须优先按 category 名判断）
            if (["周榜", "日榜", "月榜", "总榜"].includes(category) || ["weekly", "daily", "monthly"].includes(param)) {
                let rank = param || "weekly"
                url = `${this.baseUrl}/booktop/${rank}`
            } else if (["最新更新", "新书发布", "推荐漫画"].includes(category) || ["nbook", "nbook/nb", "nbook/recommend"].includes(param)) {
                let sub = param || "nbook"
                url = `${this.baseUrl}/${sub}`
            } else {
                // 分类列表
                let cate = param || "all"
                let order = "time"
                let status = "all"
                if (options && options[0] && options[0] !== "-") {
                    order = options[0]
                }
                if (options && options[1] && options[1] !== "-") {
                    status = options[1]
                }
                let path = `/bookcata/${cate}/ob/${order}/st/${status}`
                if (page > 1) {
                    path += `/page/${page}`
                }
                url = this.baseUrl + path
            }
            let html = await this.get(url)
            let comics = this.parseComicList(html)
            let maxPage = this.parseMaxPage(html)
            return {
                comics: comics,
                maxPage: maxPage,
            }
        },
        optionList: [
            {
                options: [
                    "-按时间",
                    "hits-按人气",
                ],
                label: "排序",
                notShowWhen: null,
                showWhen: ["全部", "韩漫", "日漫", "3D漫画", "美女", "单本"],
            },
            {
                options: [
                    "-全部进度",
                    "completed-已完结",
                    "serialized-更新中",
                ],
                label: "进度",
                notShowWhen: null,
                showWhen: ["全部", "韩漫", "日漫", "3D漫画", "美女", "单本"],
            },
        ],
    }

    search = {
        load: async (keyword, options, page) => {
            let order = "time"
            if (options && options[0] && options[0] !== "-") {
                order = options[0]
            }
            let url = `${this.baseUrl}/findbook/${encodeURIComponent(keyword)}/ob/${order}/st/all`
            if (page > 1) {
                url += `/page/${page}`
            }
            let html = await this.get(url)
            let comics = this.parseComicList(html)
            let maxPage = this.parseMaxPage(html)
            if (maxPage < page) maxPage = page
            return {
                comics: comics,
                maxPage: maxPage,
            }
        },
        optionList: [
            {
                type: "select",
                options: [
                    "-按时间",
                    "hits-按人气",
                ],
                label: "搜索排序",
            },
        ],
    }

    comic = {
        loadInfo: async (id) => {
            let html = await this.get(`${this.baseUrl}/manhuaview/${id}.html`)

            let titleM = html.match(/<h1[^>]*class="[^"]*hl-dc-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/)
            let title = titleM ? titleM[1].replace(/<[^>]+>/g, "").trim() : id

            let cover = ""
            let coverM = html.match(/<div class="hl-dc-pic">[\s\S]*?<span[^>]*class="[^"]*hl-item-thumb[^"]*"[^>]*data-original="([^"]*)"/)
            if (coverM) cover = coverM[1]
            if (!cover) {
                let topbg = html.match(/<span[^>]*class="[^"]*hl-topbg-pic[^"]*"[^>]*style="[^"]*url\(([^)]+)\)/)
                if (topbg) cover = topbg[1]
            }

            let description = ""
            let descM = html.match(/<li[^>]*class="[^"]*blurb[^"]*"[^>]*>[\s\S]*?<em[^>]*>[\s\S]*?<\/em>([\s\S]*?)<\/li>/)
            if (descM) description = descM[1].replace(/<[^>]+>/g, "").trim()

            let status = ""
            let statusM = html.match(/状态：[\s\S]*?<span[^>]*class="hl-text-conch"[^>]*>([\s\S]*?)<\/span>/)
            if (statusM) status = statusM[1].replace(/<[^>]+>/g, "").trim()

            let author = ""
            let authorM = html.match(/作者：[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/)
            if (authorM) author = authorM[1].replace(/<[^>]+>/g, "").trim()

            // TAG 块
            let tags = []
            let tagM = html.match(/TAG：[\s\S]*?<\/em>([\s\S]*?)<\/li>/)
            if (tagM) {
                let tagRe = /<a[^>]*>([\s\S]*?)<\/a>/g
                let tm
                while ((tm = tagRe.exec(tagM[1])) !== null) {
                    let t = tm[1].replace(/<[^>]+>/g, "").trim()
                    if (t) tags.push(t)
                }
            }

            // 章节：ul#hl-plays-list a.module-play-list-link，href 形如 /manhuaview/{id}/{epId}.html
            let chapters = new Map()
            let epRe = /<a[^>]*class="module-play-list-link"[^>]*href="\/manhuaview\/\d+\/([^"]+)\.html"[^>]*title="([^"]*)"/g
            let em
            while ((em = epRe.exec(html)) !== null) {
                let epId = em[1]
                let epTitle = em[2]
                // title 形如 "熟女交换计画-第1话-xxx"，去掉漫画名前缀
                let idx = epTitle.indexOf("-")
                if (idx > 0) {
                    epTitle = epTitle.substring(idx + 1)
                }
                chapters.set(epId, epTitle)
            }

            return {
                title: title,
                cover: cover,
                description: description,
                tags: {
                    "状态": status ? [status] : [],
                    "作者": author ? [author] : [],
                    "TAG": tags,
                },
                chapters: chapters,
                isFavorite: false,
                subId: id,
            }
        },

        loadEp: async (comicId, epId) => {
            let html = await this.get(`${this.baseUrl}/manhuaview/${comicId}/${epId}.html`)
            let images = []
            // 阅读页图片：div#m_r_imgbox_0 下 .img-wrap img[data-src]
            let imgRe = /<img[^>]*data-src="([^"]+)"[^>]*>/g
            let m
            while ((m = imgRe.exec(html)) !== null) {
                let src = m[1]
                if (src.startsWith("http")) {
                    // img.nnpic.xyz 旧图床已失效（Connection refused），统一替换为可用的 p4.nnpic.xyz
                    src = src.replace("https://img.nnpic.xyz/", "https://p4.nnpic.xyz/")
                    images.push(src)
                }
            }
            return { images: images }
        },
    }

    settings = {
        // 无特殊设置
    }

    // [Optional] translations
    translation = {
        'zh_CN': {
            '轮播推荐': '轮播推荐',
            '热门漫画': '热门漫画',
            '最新更新': '最新更新',
            '漫画分类': '漫画分类',
            '进度': '进度',
            '排行榜': '排行榜',
            '全部': '全部',
            '韩漫': '韩漫',
            '日漫': '日漫',
            '3D漫画': '3D漫画',
            '美女': '美女',
            '单本': '单本',
            '已完结': '已完结',
            '更新中': '更新中',
            '周榜': '周榜',
            '日榜': '日榜',
            '月榜': '月榜',
            '总榜': '总榜',
            '最新更新': '最新更新',
            '新书发布': '新书发布',
            '推荐漫画': '推荐漫画',
            '按时间': '按时间',
            '按人气': '按人气',
            '全部进度': '全部进度',
            '排序': '排序',
            '搜索排序': '搜索排序',
        },
        'zh_TW': {
            '轮播推荐': '輪播推薦',
            '热门漫画': '熱門漫畫',
            '最新更新': '最新更新',
            '漫画分类': '漫畫分類',
            '进度': '進度',
            '排行榜': '排行榜',
            '全部': '全部',
            '韩漫': '韓漫',
            '日漫': '日漫',
            '3D漫画': '3D漫畫',
            '美女': '美女',
            '单本': '單本',
            '已完结': '已完結',
            '更新中': '更新中',
            '周榜': '周榜',
            '日榜': '日榜',
            '月榜': '月榜',
            '总榜': '總榜',
            '最新更新': '最新更新',
            '新书发布': '新書發布',
            '推荐漫画': '推薦漫畫',
            '按时间': '按時間',
            '按人气': '按人氣',
            '全部进度': '全部進度',
            '排序': '排序',
            '搜索排序': '搜尋排序',
        },
    }
  }
