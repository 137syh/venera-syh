/** @type {import('./_venera_.js')} */ 
function getValidatorCookie(htmlString) {
    const cookieRegex = /document\.cookie\s*=\s*"([^"]+)"/;
    const match = htmlString.match(cookieRegex);
    
    if (!match) return null;
    
    const cookieSetting = match[1];
    const cookies = cookieSetting.split(';');
    
    if (cookies.length === 0) return null;
    
    const nameValuePart = cookies[0].trim();
    const equalsIndex = nameValuePart.indexOf('=');
    const name = nameValuePart.substring(0, equalsIndex);
    const value = nameValuePart.substring(equalsIndex + 1);
    
    return new Cookie({ name, value, domain: "www.ikmmh.com" });
}

function needPassValidator(htmlString) {
    var cookie = getValidatorCookie(htmlString);
    if (cookie != null) {
        Network.setCookies(Ikm.baseUrl, [cookie]);
        return true;
    }
    return false;
}

class Ikm extends ComicSource {
    name = "爱看漫";
    key = "ikmmh";
    version = "2.1.2";
    minAppVersion = "1.0.0";
    url = "https://137syh.github.io/venera-syh/ikm.js";

    static baseUrl = "https://www.ikmmh.com";
    static Mobile_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1 Edg/140.0.0.0";
    static webHeaders = {
        "User-Agent": Ikm.Mobile_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    };
    static jsonHead = {
        "User-Agent": Ikm.Mobile_UA,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Encoding": "gzip",
        "X-Requested-With": "XMLHttpRequest",
    };

    static thumbConfig = (url) => ({
        headers: { ...Ikm.webHeaders, "referer": Ikm.baseUrl },
    });

    account = {
        login: async (account, pwd) => {
            try {
                let res = await Network.post(`${Ikm.baseUrl}/api/user/userarr/login`, Ikm.jsonHead, `user=${account}&pass=${pwd}`);
                if (res.status !== 200) throw new Error(`登录失败，状态码：${res.status}`);
                if (needPassValidator(res.body)) {
                    res = await Network.post(`${Ikm.baseUrl}/api/user/userarr/login`, Ikm.jsonHead, `user=${account}&pass=${pwd}`);
                }
                let data = JSON.parse(res.body);
                if (data.code !== 0) throw new Error(data.msg || "登录异常");
                return "ok";
            } catch (err) {
                throw new Error(`登录失败：${err.message}`);
            }
        },
        logout: () => Network.deleteCookies("www.ikmmh.com"),
        registerWebsite: `${Ikm.baseUrl}/user/register/`,
    };

    explore = [
        {
            title: this.name,
            type: "singlePageWithMultiPart",
            load: async () => {
                try {
                    let res = await Network.get(`${Ikm.baseUrl}/`, Ikm.webHeaders);
                    if (res.status !== 200) throw new Error(`加载探索页面失败，状态码：${res.status}`);
                    if (needPassValidator(res.body)) {
                        res = await Network.get(`${Ikm.baseUrl}/`, Ikm.webHeaders);
                    }
                    let document = new HtmlDocument(res.body);
                    let parseComic = (e) => {
                        let title = e.querySelector("div.title").text.split("~")[0];
                        let cover = e.querySelector("div.thumb_img").attributes["data-src"];
                        let link = `${Ikm.baseUrl}${e.querySelector("a").attributes["href"]}`;
                        return { title, cover, id: link };
                    };
                    return {
                        "本周推荐": document.querySelectorAll("div.module-good-fir > div.item").map(parseComic),
                        "今日更新": document.querySelectorAll("div.module-day-fir > div.item").map(parseComic),
                    };
                } catch (err) {
                    throw new Error(`探索页面加载失败：${err.message}`);
                }
            },
            onThumbnailLoad: Ikm.thumbConfig,
        },
    ];

    category = {
        title: "爱看漫",
        parts: [
            {
                name: "更新",
                type: "fixed",
                categories: ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"],
                itemType: "category",
                categoryParams: ["1", "2", "3", "4", "5", "6", "7"],
            },
            {
                name: "分类",
                type: "fixed",
                categories: [
                    "全部", "长条", "大女主", "百合", "耽美", "纯爱", "後宫", "韩漫", "奇幻",
                    "轻小说", "生活", "悬疑", "格斗", "搞笑", "伪娘", "竞技", "职场", "萌系",
                    "冒险", "治愈", "都市", "霸总", "神鬼", "侦探", "爱情", "古风", "欢乐向",
                    "科幻", "穿越", "性转换", "校园", "美食", "悬疑", "剧情", "热血", "节操",
                    "励志", "异世界", "历史", "战争", "恐怖", "霸总"
                ],
                itemType: "category",
            }
        ],
        enableRankingPage: false,
    };

    categoryComics = {
        load: async (category, param, options, page) => {
            try {
                let res;
                if (param) {
                    res = await Network.get(`${Ikm.baseUrl}/update/${param}.html`, Ikm.webHeaders);
                    if (res.status !== 200) throw new Error(`分类请求失败，状态码：${res.status}`);
                    if (needPassValidator(res.body)) {
                        res = await Network.get(`${Ikm.baseUrl}/update/${param}.html`, Ikm.webHeaders);
                    }
                    let document = new HtmlDocument(res.body);
                    let comics = document.querySelectorAll("li.comic-item").map((e) => ({
                        title: e.querySelector("p.title").text.split("~")[0],
                        cover: e.querySelector("img").attributes["src"],
                        id: `${Ikm.baseUrl}${e.querySelector("a").attributes["href"]}`,
                        subTitle: e.querySelector("span.chapter").text,
                    }));
                    return { comics, maxPage: 1 };
                } else {
                    res = await Network.post(
                        `${Ikm.baseUrl}/api/comic/index/lists`,
                        Ikm.jsonHead,
                        `area=${options[1]}&tags=${encodeURIComponent(category)}&full=${options[0]}&page=${page}`
                    );
                    if (needPassValidator(res.body)) {
                        res = await Network.post(
                            `${Ikm.baseUrl}/api/comic/index/lists`,
                            Ikm.jsonHead,
                            `area=${options[1]}&tags=${encodeURIComponent(category)}&full=${options[0]}&page=${page}`
                        );
                    }
                    let resData = JSON.parse(res.body);
                    return {
                        comics: resData.data.map((e) => ({
                            id: `${Ikm.baseUrl}${e.info_url}`,
                            title: e.name.split("~")[0],
                            subTitle: e.author,
                            cover: e.cover,
                            tags: e.tags,
                            description: e.lastchapter,
                        })),
                        maxPage: resData.end || 1,
                    };
                }
            } catch (err) {
                throw new Error(`分类加载失败：${err.message}`);
            }
        },
        onThumbnailLoad: Ikm.thumbConfig,
        optionList: [
            {
                options: ["3-全部", "4-连载中", "1-已完结"],
                notShowWhen: ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"],
                showWhen: null,
            },
            {
                options: ["9-全部", "1-日漫", "2-港台", "3-美漫", "4-国漫", "5-韩漫", "6-未分类"],
                notShowWhen: ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"],
                showWhen: null,
            },
        ],
    };

    search = {
        load: async (keyword, options, page) => {
            try {
                let res = await Network.get(`${Ikm.baseUrl}/search?searchkey=${encodeURIComponent(keyword)}`, Ikm.webHeaders);
                if (needPassValidator(res.body)) {
                    res = await Network.get(`${Ikm.baseUrl}/search?searchkey=${encodeURIComponent(keyword)}`, Ikm.webHeaders);
                }
                let document = new HtmlDocument(res.body);
                return {
                    comics: document.querySelectorAll("li.comic-item").map((e) => ({
                        title: e.querySelector("p.title").text.split("~")[0],
                        cover: e.querySelector("img").attributes["src"],
                        id: `${Ikm.baseUrl}${e.querySelector("a").attributes["href"]}`,
                        subTitle: e.querySelector("span.chapter").text,
                    })),
                    maxPage: 1,
                };
            } catch (err) {
                throw new Error(`搜索失败：${err.message}`);
            }
        },
        onThumbnailLoad: Ikm.thumbConfig,
        optionList: [],
    };

    favorites = {
        multiFolder: false,
        addOrDelFavorite: async (comicId, folderId, isAdding) => {
            try {
                let id = comicId.match(/\d+/)[0];
                if (isAdding) {
                    let infoRes = await Network.get(comicId, Ikm.webHeaders);
                    if (needPassValidator(infoRes.body)) {
                        infoRes = await Network.get(comicId, Ikm.webHeaders);
                    }
                    let name = new HtmlDocument(infoRes.body).querySelector("meta[property='og:title']").attributes["content"];
                    let res = await Network.post(
                        `${Ikm.baseUrl}/api/user/bookcase/add`,
                        Ikm.jsonHead,
                        `articleid=${id}&articlename=${encodeURIComponent(name)}`
                    );
                    let data = JSON.parse(res.body);
                    if (data.code !== "0") throw new Error(data.msg || "收藏失败");
                    return "ok";
                } else {
                    let res = await Network.post(`${Ikm.baseUrl}/api/user/bookcase/del`, Ikm.jsonHead, `articleid=${id}`);
                    if (needPassValidator(res.body)) {
                        res = await Network.post(`${Ikm.baseUrl}/api/user/bookcase/del`, Ikm.jsonHead, `articleid=${id}`);
                    }
                    let data = JSON.parse(res.body);
                    if (data.code !== "0") throw new Error(data.msg || "取消收藏失败");
                    return "ok";
                }
            } catch (err) {
                throw new Error(`收藏操作失败：${err.message}`);
            }
        },
        loadComics: async (page, folder) => {
            let res = await Network.get(`${Ikm.baseUrl}/user/bookcase`, Ikm.webHeaders);
            if (res.status !== 200) throw "加载收藏失败：" + res.status;
            if (needPassValidator(res.body)) {
                res = await Network.get(`${Ikm.baseUrl}/user/bookcase`, Ikm.webHeaders);
            }
            let document = new HtmlDocument(res.body);
            return {
                comics: document.querySelectorAll("div.bookrack-item").map((e) => ({
                    title: e.querySelector("h3").text.split("~")[0],
                    subTitle: e.querySelector("p.desc").text,
                    cover: e.querySelector("img").attributes["src"],
                    id: `${Ikm.baseUrl}/book/${e.attributes["data-id"]}/`,
                })),
                maxPage: 1,
            };
        },
        onThumbnailLoad: Ikm.thumbConfig,
    };

    comic = {
        loadInfo: async (id) => {
            let isFavorite = false;
            try {
                let favorites = await this.favorites.loadComics(1, null);
                isFavorite = favorites.comics.some((comic) => comic.id === id);
            } catch (error) {
                console.error("加载收藏页失败:", error);
            }
            let res = await Network.get(id, Ikm.webHeaders);
            if (needPassValidator(res.body)) res = await Network.get(id, Ikm.webHeaders);
            let document = new HtmlDocument(res.body);
            let comicId = id.match(/\d+/)[0];

            // 获取章节数据
            let epRes = await Network.get(
                `${Ikm.baseUrl}/api/comic/zyz/chapterlink?id=${comicId}`,
                { ...Ikm.jsonHead, "referer": id }
            );
            let epData = JSON.parse(epRes.body);
            let eps = new Map();
            if (epData.data && epData.data.length > 0 && epData.data[0].list) {
                epData.data[0].list.forEach((e) => {
                    let title = e.name;
                    let epLink = `${Ikm.baseUrl}${e.url}`;
                    eps.set(epLink, title);
                });
            } else {
                throw new Error(`章节数据格式异常`);
            }

            let title = document.querySelector("div.book-hero__detail > div.title").text;
            let escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            let thumb = document.querySelector("div.coverimg").attributes["style"].match(/\((.*?)\)/)?.[1] || "";
            let desc = document.querySelector("article.book-container__detail").text.match(
                new RegExp(`漫画名：${escapedTitle}(?:(?:[^。]*?(?:简介|漫画简介)\\s*[:：]?\\s*)|(?:[^。]*?))([\\s\\S]+?)\\.\\.\\.。`)
            );
            let intro = desc?.[1]?.trim().replace(/\s+/g, " ") || "";

            return {
                title: title.split("~")[0],
                cover: thumb,
                description: intro,
                tags: {
                    "作者": [document.querySelector("div.book-container__author").text.split("作者：")[1]],
                    "更新": [document.querySelector("div.update > a > em").text],
                    "标签": document.querySelectorAll("div.book-hero__detail > div.tags > a").map((e) => e.text.trim()).filter((text) => text),
                },
                chapters: eps,
                recommend: document.querySelectorAll("div.module-guessu > div.item").map((e) => ({
                    title: e.querySelector("div.title").text.split("~")[0],
                    cover: e.querySelector("div.thumb_img").attributes["data-src"],
                    id: `${Ikm.baseUrl}${e.querySelector("a").attributes["href"]}`,
                })),
                isFavorite: isFavorite,
            };
        },
        onThumbnailLoad: Ikm.thumbConfig,
        loadEp: async (comicId, epId) => {
            try {
                // 步骤1: 获取章节页面，提取章节ID(cid)和漫画ID(aid)
                let res = await Network.get(epId, Ikm.webHeaders);
                if (needPassValidator(res.body)) {
                    res = await Network.get(epId, Ikm.webHeaders);
                }
                if (res.status !== 200) {
                    throw new Error(`章节页请求失败，状态码：${res.status}`);
                }

                // 从页面中提取章节ID (cid)，兼容 data-chapter-id 与 read 变量两种来源
                let cidMatch = res.body.match(/data-chapter-id=["'](\d+)["']/);
                if (!cidMatch) {
                    cidMatch = res.body.match(/cid:\s*['"]?(\d+)['"]?/);
                }
                if (!cidMatch) {
                    throw new Error("无法从页面中获取章节ID (cid)");
                }
                const cid = cidMatch[1];

                // 从页面中提取漫画ID (aid)
                // 从页面中的JavaScript变量提取，例如：let read = {aid: '7491',cid:'761977',...}
                const aidMatch = res.body.match(/aid:\s*['"]?(\d+)['"]?/);
                if (!aidMatch) {
                    throw new Error("无法从页面中获取漫画ID (aid)");
                }
                const aid = aidMatch[1];

                // 步骤2: 获取图片总数（可选，但建议获取）
                // 可以从页面中的picCount变量获取，或者通过API获取
                let totalImages = 0;
                const picCountMatch = res.body.match(/picCount:\s*(\d+)/);
                if (picCountMatch) {
                    totalImages = parseInt(picCountMatch[1]);
                }

                // 步骤3: 循环调用图片API获取所有图片
                let allImages = [];
                let offset = 0;
                const limit = 20; // 每次请求20张图片（服务端实际固定返回10张，以实际返回数为准）
                let emptyPageCount = 0; // 连续空页计数，用于容错
                const maxEmptyPages = 2;

                // 循环获取所有图片
                while (true) {
                    // 构造API请求参数
                    const params = `id=${cid}&aid=${aid}&offset=${offset}&limit=${limit}`;
                    
                    // 发送POST请求到图片API
                    let picRes = await Network.post(
                        `${Ikm.baseUrl}/api/comic/read/pics`,
                        Ikm.jsonHead,
                        params
                    );

                    if (picRes.status !== 200) {
                        throw new Error(`图片API请求失败，状态码：${picRes.status}`);
                    }

                    // 解析响应数据
                    let picData = JSON.parse(picRes.body);
                    
                    // 检查响应数据格式
                    if (!picData.data || !picData.data.pic || !Array.isArray(picData.data.pic)) {
                        throw new Error("图片数据格式不正确");
                    }

                    // 提取图片URL
                    const images = picData.data.pic.map(item => {
                        // 确保pic字段存在且是字符串
                        if (item.pic && typeof item.pic === 'string') {
                            return item.pic;
                        }
                        return null;
                    }).filter(url => url !== null);

                    // 将图片添加到总列表（用Set去重，防止服务端返回重复图片）
                    allImages = allImages.concat(images);
                    allImages = Array.from(new Set(allImages));

                    // 检查是否获取完所有图片
                    if (picData.data.total !== undefined) {
                        totalImages = picData.data.total;
                    }
                    
                    // 如果本次请求没有返回图片，则计数；连续多次空页才退出（兼容服务端偶发空响应）
                    if (images.length === 0) {
                        emptyPageCount++;
                        if (emptyPageCount >= maxEmptyPages) {
                            break;
                        }
                        offset += limit;
                        continue;
                    }
                    emptyPageCount = 0;

                    // 更新偏移量，准备获取下一批图片
                    // 注意：服务端会忽略limit参数，固定每页返回10条，
                    // 必须用实际返回的图片数步进，否则会跳过中间页导致图片缺失
                    offset += images.length;

                    // 如果已经获取的图片数量达到总数，则退出循环
                    if (allImages.length >= totalImages) {
                        break;
                    }
                }

                if (allImages.length === 0) {
                    throw new Error("未能获取到任何图片");
                }
                if (totalImages > 0 && allImages.length < totalImages) {
                    console.log(`章节图片不完整：已获取 ${allImages.length}/${totalImages}`);
                }

                // 步骤4: 返回图片列表
                return { images: allImages };

            } catch (err) {
                throw new Error(`加载章节失败：${err.message}`);
            }
        },
        onImageLoad: (url, comicId, epId) => {
            // 参数验证
            if (!url || typeof url !== 'string') {
                return null;
            }
            
            // 确保不传递加载动画图片
            if (url.includes('load.gif')) {
                return null;
            }
            
            // 确保referer是完整URL
            let referer = epId;
            if (!referer.startsWith('http')) {
                referer = Ikm.baseUrl + epId;
            }
            
            // 返回图片加载配置
            return {
                url: url,
                headers: {
                    ...Ikm.webHeaders,
                    "referer": referer,
                },
            };
        },
    };
}
