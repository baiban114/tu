CREATE DATABASE tu DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE tu;

CREATE TABLE tu_article
(
    id                      BIGINT AUTO_INCREMENT COMMENT '主键'
        PRIMARY KEY,
    article_title           VARCHAR(128) NULL COMMENT '文章标题',
    article_thumbnail_url   VARCHAR(128) NULL COMMENT '文章缩略图',
    article_author_id       BIGINT NULL COMMENT '文章作者id',
    article_type            CHAR DEFAULT '0' NULL COMMENT '文章类型',
    article_tags            VARCHAR(128) NULL COMMENT '文章标签',
    article_view_count      INT  DEFAULT 1 NULL COMMENT '浏览总数',
    article_preview_content VARCHAR(256) NULL COMMENT '预览内容',
    article_comment_count   INT  DEFAULT 0 NULL COMMENT '评论总数',
    article_permalink       VARCHAR(128) NULL COMMENT '文章永久链接',
    article_link            VARCHAR(32) NULL COMMENT '站内链接',
    created_time            DATETIME NULL COMMENT '创建时间',
    updated_time            DATETIME NULL COMMENT '更新时间',
    article_perfect         CHAR DEFAULT '0' NULL COMMENT '0:非优选1：优选',
    article_status          CHAR DEFAULT '0' NULL COMMENT '文章状态',
    article_thumbs_up_count INT  DEFAULT 0 NULL COMMENT '点赞总数',
    article_sponsor_count   INT  DEFAULT 0 NULL COMMENT '赞赏总数'
) COMMENT '文章表 ' COLLATE = utf8mb4_unicode_ci;

INSERT INTO tu.tu_article (id, article_title, article_thumbnail_url, article_author_id, article_type, article_tags, article_view_count, article_preview_content, article_comment_count, article_permalink, article_link, created_time, updated_time, article_perfect, article_status, article_thumbs_up_count, article_sponsor_count) VALUES (1, '给新人的一封信', NULL, 1, '0', '公告,新手信', 3275, '您好，欢迎来到 run 社区，run 是一个嵌入式知识学习交流平台。RY 取自”容易”的首字母，寓意为让电子设计变得 so easy。新手的疑问初学者都有很多疑问，在这里对这些疑问进行一一解答。我英语不好，可以学习编程吗？对于初学者来说，英语不是主要的障碍，国内有着充足的中文教程。但在接下来的学习过程中，需要阅读大量的英文文档，所以还是需要有一些英语基础和理解学习能力，配合翻译工具（如百度', 0, 'http://localhost:3000/article/1', '/article/1', '2020-01-03 01:27:25', '2022-09-26 15:33:03', '0', '0', 7, 3);

CREATE TABLE tu_article_content
(
    id_article           BIGINT NOT NULL COMMENT '主键',
    article_content      TEXT NULL COMMENT '文章内容原文',
    article_content_html TEXT NULL COMMENT '文章内容Html',
    created_time         DATETIME NULL COMMENT '创建时间',
    updated_time         DATETIME NULL COMMENT '更新时间'
) COMMENT ' ' COLLATE = utf8mb4_unicode_ci;

CREATE INDEX tu_article_content_id_article_index
    ON tu_article_content (id_article);

INSERT INTO tu.tu_article_content (id_article, article_content, article_content_html, created_time, updated_time) VALUES (1, '您好，欢迎来到 run 社区，run 是一个嵌入式知识学习交流平台。RY 取自”容易”的首字母，寓意为让电子设计变得 so easy。

## 新手的疑问

初学者都有很多疑问，在这里对这些疑问进行一一解答。

- 我英语不好，可以学习编程吗？
  对于初学者来说，英语不是主要的障碍，国内有着充足的中文教程。但在接下来的学习过程中，需要阅读大量的英文文档，所以还是需要有一些英语基础和理解学习能力，配合翻译工具（如百度翻译）进行理解。
- 我数学不好，可以学习编程吗？
  对于初学者来说，有必要掌握数学逻辑思维和解决问题的思路，这些能力都在数学学习中得到锻炼，想必学习编程的人数学成绩肯定不错。初学者不需要多高的数学知识水平，但在未来的学习过程中需要更高级的数学知识，应随时做好接受学习新知识的准备。
- 我想学习编程，大佬可以教教我吗？
  一般我是拒绝的，我认为学习是互相促进的过程，而不是单方面的输出，并且我也有很多事情要做。不仅是我，绝大多数人都会拒绝。
- 学习编程是使用 IDE 好还是 Notepad 好？
  最近看到有人在争论这个问题，使用 IDE 是新手的不二选择。
- 好吧，我自学编程，有问题可以问大佬吗？
  可以，但是我拒绝回答书中的基础问题和可以通过搜索引擎解决的问题。
- 学习编程是看书好还是看视频好？
  萝卜青菜，各有所爱，关键是看哪种方式能让你更好理解和学习。我个人是喜爱书本，可以随时查阅资料，非常方便。
- 我学习了很久，但没有成效，我是不是没有天赋？
  我个人觉得对于入门的学习来说，天赋对于学习的影响微乎其微，如果你的学习效率低下，考虑是不是以下原因：

  - 单纯的努力不足，三天打鱼两天晒网。如果不能改正，不如考虑干点别的。
  - 数学逻辑思维和解决问题的能力不足。这个可以学习一些简单易懂的教程，看看视频等，慢慢锻炼，没有任何捷径。
  - 学习方法不对，主要是练得少。只翻书和看视频是没有用的，必须配合大量的练习。个人推荐的方法是：
    - 看完书以后把书上给出的例题再敲一遍，不是照着书上写。
    - 把课后习题都给做了。
    - 做几个自己感兴趣的项目。
    - 对于自己不懂的问题，先看看书，再百度谷歌，最后才询问他人。

## 提问的方法

当你遇到**使用搜索引擎、查阅相关文档、进行 Debug**（如果没有做过上述操作的话，请立刻去做）也无法解决的问题的时候，你可能会向别人求助。现在就来讲讲如何正确提问。

当你进行提问时，请保证你准确提供了以下信息：

- 准确的描述你的需求和实际问题情况。
- 准确的描述你所在的平台的信息。例如：
  - 开发板型号
  - 运行程序( IDE 等)名称及其版本
  - Windows/Linux/MacOS 任一平台及其版本
  - 依赖的类库及其版本
- 提供你的源代码，将源代码包括开发环境完整上传至源码托管平台（如 Github）。
- 提供你的完整日志、异常输出。

如果你在社区提问，请在你的标题也简略的包含问题描述和平台信息。例如 `stm32f103x 开发板` `win10` 运行串口通信程序时，中文显示乱码

如果你想学习更多关于提问的方法、技巧、礼仪，看看[提问的智慧](https://run.com/article/80)会给予你许多帮助。

## 自学的方法

- 每当学习到新知识的时候应该及时的练习和实践
- 多看看开发文档，每次你都能获得新的收获
- 多看看别人的源代码，很多问题都能得到解决
- 搜索引擎是一个好东西
- 写学习笔记和博客是记录知识的好方式，但不是死记知识点
- 好的提问方式才能获得正确答案
- 合理的规划学习时间，而不是三天打鱼两天晒网

## C 语言基础教程

- [C 语言中文教程](https://doc.yonyoucloud.com/doc/wiki/project/c/c-intro.html)
- [C语言小白变怪兽](http://c.biancheng.net/c/)

## 单片机基础教程

- [51 单片机入门教程(Keil4 版)](https://run.com/portfolio/42)
- [STM32 独家入门秘籍](https://run.com/portfolio/11)
- [51 单片机入门教程(VS Code 版)](https://run.com/portfolio/41)

## 其他教程

- [markdown 教程](https://run.com/guides/markdown)
- [社区编辑器使用教程](https://run.com/guides/vditor)

## 推荐书籍

- 《C 程序设计语言( 第 2 版 ) 》 —— [美] 布莱恩·W.克尼汉（Brian W.Kernighan），[美] 丹尼斯·M.里奇（Dennis M.Ritchie） 著
- 《软技能: 代码之外的生存指南》—— [美] 约翰 Z.森梅兹（John Z.Sonmez） 著
- 《大教堂与集市》—— [美] Eric S Raymond 著
- 《黑客与画家》—— [美] Paul Graham 著

## 愿景

> 关于更多的信息请阅读 [《run 白皮书》](https://run.com/article/115)

我们致力于构建一个即严谨又活泼、专业又不失有趣的开源嵌入式知识平台。在这里我们可以畅所欲言、以平等、自由的身份获取和分享知识。在这里共同学习、交流、进步、成长。

## 行为准则

> 详细行为准则请参考 [参与者公约](https://run.com/article/20)

无论问题简单与否，欢迎大家积极留言、评论、交流。对他人多一些理解和包容，帮助他人解决问题和自我提升是我们的终极目标。
欢迎您发表原创文章、分享独到见解、作出有价值的评论。所有原创内容著作权均归作者本人所有。所发表内容不得侵犯企业或个人的合法权益，包括但不限于涉及个人隐私、造谣与诽谤、商业侵权。

## 其他

### 微信公众号

![qrcodeforgh245b3234e782258.jpg](https://static.run.com/article/1642081054095.jpg)

### github

[run](https://github.com/run)

### gitee

[run 社区](https://gitee.com/run-community)

', '<p>您好，欢迎来到 run 社区，run 是一个嵌入式知识学习交流平台。RY 取自”容易”的首字母，寓意为让电子设计变得 so easy。</p>
<h2 id="新手的疑问">新手的疑问</h2>
<p>初学者都有很多疑问，在这里对这些疑问进行一一解答。</p>
<ul>
<li>
<p>我英语不好，可以学习编程吗？<br />
对于初学者来说，英语不是主要的障碍，国内有着充足的中文教程。但在接下来的学习过程中，需要阅读大量的英文文档，所以还是需要有一些英语基础和理解学习能力，配合翻译工具（如百度翻译）进行理解。</p>
</li>
<li>
<p>我数学不好，可以学习编程吗？<br />
对于初学者来说，有必要掌握数学逻辑思维和解决问题的思路，这些能力都在数学学习中得到锻炼，想必学习编程的人数学成绩肯定不错。初学者不需要多高的数学知识水平，但在未来的学习过程中需要更高级的数学知识，应随时做好接受学习新知识的准备。</p>
</li>
<li>
<p>我想学习编程，大佬可以教教我吗？<br />
一般我是拒绝的，我认为学习是互相促进的过程，而不是单方面的输出，并且我也有很多事情要做。不仅是我，绝大多数人都会拒绝。</p>
</li>
<li>
<p>学习编程是使用 IDE 好还是 Notepad 好？<br />
最近看到有人在争论这个问题，使用 IDE 是新手的不二选择。</p>
</li>
<li>
<p>好吧，我自学编程，有问题可以问大佬吗？<br />
可以，但是我拒绝回答书中的基础问题和可以通过搜索引擎解决的问题。</p>
</li>
<li>
<p>学习编程是看书好还是看视频好？<br />
萝卜青菜，各有所爱，关键是看哪种方式能让你更好理解和学习。我个人是喜爱书本，可以随时查阅资料，非常方便。</p>
</li>
<li>
<p>我学习了很久，但没有成效，我是不是没有天赋？<br />
我个人觉得对于入门的学习来说，天赋对于学习的影响微乎其微，如果你的学习效率低下，考虑是不是以下原因：</p>
<ul>
<li>单纯的努力不足，三天打鱼两天晒网。如果不能改正，不如考虑干点别的。</li>
<li>数学逻辑思维和解决问题的能力不足。这个可以学习一些简单易懂的教程，看看视频等，慢慢锻炼，没有任何捷径。</li>
<li>学习方法不对，主要是练得少。只翻书和看视频是没有用的，必须配合大量的练习。个人推荐的方法是：
<ul>
<li>看完书以后把书上给出的例题再敲一遍，不是照着书上写。</li>
<li>把课后习题都给做了。</li>
<li>做几个自己感兴趣的项目。</li>
<li>对于自己不懂的问题，先看看书，再百度谷歌，最后才询问他人。</li>
</ul>
</li>
</ul>
</li>
</ul>
<h2 id="提问的方法">提问的方法</h2>
<p>当你遇到<strong>使用搜索引擎、查阅相关文档、进行 Debug</strong>（如果没有做过上述操作的话，请立刻去做）也无法解决的问题的时候，你可能会向别人求助。现在就来讲讲如何正确提问。</p>
<p>当你进行提问时，请保证你准确提供了以下信息：</p>
<ul>
<li>准确的描述你的需求和实际问题情况。</li>
<li>准确的描述你所在的平台的信息。例如：
<ul>
<li>开发板型号</li>
<li>运行程序( IDE 等)名称及其版本</li>
<li>Windows/Linux/MacOS 任一平台及其版本</li>
<li>依赖的类库及其版本</li>
</ul>
</li>
<li>提供你的源代码，将源代码包括开发环境完整上传至源码托管平台（如 Github）。</li>
<li>提供你的完整日志、异常输出。</li>
</ul>
<p>如果你在社区提问，请在你的标题也简略的包含问题描述和平台信息。例如 <code>stm32f103x 开发板</code> <code>win10</code> 运行串口通信程序时，中文显示乱码</p>
<p>如果你想学习更多关于提问的方法、技巧、礼仪，看看<a href="https://run.com/article/80">提问的智慧</a>会给予你许多帮助。</p>
<h2 id="自学的方法">自学的方法</h2>
<ul>
<li>每当学习到新知识的时候应该及时的练习和实践</li>
<li>多看看开发文档，每次你都能获得新的收获</li>
<li>多看看别人的源代码，很多问题都能得到解决</li>
<li>搜索引擎是一个好东西</li>
<li>写学习笔记和博客是记录知识的好方式，但不是死记知识点</li>
<li>好的提问方式才能获得正确答案</li>
<li>合理的规划学习时间，而不是三天打鱼两天晒网</li>
</ul>
<h2 id="C-语言基础教程">C 语言基础教程</h2>
<ul>
<li><a href="https://doc.yonyoucloud.com/doc/wiki/project/c/c-intro.html">C 语言中文教程</a></li>
<li><a href="http://c.biancheng.net/c/">C 语言小白变怪兽</a></li>
</ul>
<h2 id="单片机基础教程">单片机基础教程</h2>
<ul>
<li><a href="https://run.com/portfolio/42">51 单片机入门教程(Keil4 版)</a></li>
<li><a href="https://run.com/portfolio/11">STM32 独家入门秘籍</a></li>
<li><a href="https://run.com/portfolio/41">51 单片机入门教程(VS Code 版)</a></li>
</ul>
<h2 id="其他教程">其他教程</h2>
<ul>
<li><a href="https://run.com/guides/markdown">markdown 教程</a></li>
<li><a href="https://run.com/guides/vditor">社区编辑器使用教程</a></li>
</ul>
<h2 id="推荐书籍">推荐书籍</h2>
<ul>
<li>《C 程序设计语言( 第 2 版 ) 》 —— [美] 布莱恩·W.克尼汉（Brian W.Kernighan），[美] 丹尼斯·M.里奇（Dennis M.Ritchie） 著</li>
<li>《软技能: 代码之外的生存指南》—— [美] 约翰 Z.森梅兹（John Z.Sonmez） 著</li>
<li>《大教堂与集市》—— [美] Eric S Raymond 著</li>
<li>《黑客与画家》—— [美] Paul Graham 著</li>
</ul>
<h2 id="愿景">愿景</h2>
<blockquote>
<p>关于更多的信息请阅读 <a href="https://run.com/article/115">《run 白皮书》</a></p>
</blockquote>
<p>我们致力于构建一个即严谨又活泼、专业又不失有趣的开源嵌入式知识平台。在这里我们可以畅所欲言、以平等、自由的身份获取和分享知识。在这里共同学习、交流、进步、成长。</p>
<h2 id="行为准则">行为准则</h2>
<blockquote>
<p>详细行为准则请参考 <a href="https://run.com/article/20">参与者公约</a></p>
</blockquote>
<p>无论问题简单与否，欢迎大家积极留言、评论、交流。对他人多一些理解和包容，帮助他人解决问题和自我提升是我们的终极目标。<br />
欢迎您发表原创文章、分享独到见解、作出有价值的评论。所有原创内容著作权均归作者本人所有。所发表内容不得侵犯企业或个人的合法权益，包括但不限于涉及个人隐私、造谣与诽谤、商业侵权。</p>
<h2 id="其他">其他</h2>
<h3 id="微信公众号">微信公众号</h3>
<p><img src="https://static.run.com/article/1642081054095.jpg" alt="qrcodeforgh245b3234e782258.jpg" /></p>
<h3 id="github">github</h3>
<p><a href="https://github.com/run">run</a></p>
<h3 id="gitee">gitee</h3>
<p><a href="https://gitee.com/run-community">run 社区</a></p>
', '2020-01-03 15:27:25', '2022-09-26 15:33:02');


CREATE TABLE tu_article_thumbs_up
(
    id             BIGINT AUTO_INCREMENT COMMENT '主键'
        PRIMARY KEY,
    id_article     BIGINT NULL COMMENT '文章表主键',
    id_user        BIGINT NULL COMMENT '用户表主键',
    thumbs_up_time DATETIME NULL COMMENT '点赞时间'
) COMMENT '文章点赞表 ' COLLATE = utf8mb4_unicode_ci;

CREATE TABLE tu_bank
(
    id               BIGINT AUTO_INCREMENT COMMENT '主键'
        PRIMARY KEY,
    bank_name        VARCHAR(64) NULL COMMENT '银行名称',
    bank_owner       BIGINT NULL COMMENT '银行负责人',
    bank_description VARCHAR(512) NULL COMMENT '银行描述',
    created_by       BIGINT NULL COMMENT '创建人',
    created_time     DATETIME NULL COMMENT '创建时间'
) COMMENT '银行表 ' COLLATE = utf8mb4_unicode_ci;

CREATE TABLE tu_bank_account
(
    id              BIGINT AUTO_INCREMENT COMMENT '主键'
        PRIMARY KEY,
    id_bank         BIGINT NULL COMMENT '所属银行',
    bank_account    VARCHAR(32) NULL COMMENT '银行账户',
    account_balance DECIMAL(32, 8) NULL COMMENT '账户余额',
    account_owner   BIGINT NULL COMMENT '账户所有者',
    created_time    DATETIME NULL COMMENT '创建时间',
    account_type    CHAR DEFAULT '0' NULL COMMENT '0: 普通账户 1: 银行账户'
) COMMENT '银行账户表 ' COLLATE = utf8mb4_unicode_ci;

CREATE UNIQUE INDEX tu_bank_account_pk
    ON tu_bank_account (account_owner, bank_account);

CREATE TABLE tu_comment
(
    id                          BIGINT AUTO_INCREMENT COMMENT '主键'
        PRIMARY KEY,
    comment_content             TEXT NULL COMMENT '评论内容',
    comment_author_id           BIGINT NULL COMMENT '作者 id',
    comment_article_id          BIGINT NULL COMMENT '文章 id',
    comment_sharp_url           VARCHAR(256) NULL COMMENT '锚点 url',
    comment_original_comment_id BIGINT NULL COMMENT '父评论 id',
    comment_status              CHAR DEFAULT '0' NULL COMMENT '状态',
    comment_ip                  VARCHAR(128) NULL COMMENT '评论 IP',
    comment_ua                  VARCHAR(512) NULL COMMENT 'User-Agent',
    comment_anonymous           CHAR NULL COMMENT '0：公开回帖，1：匿名回帖',
    comment_reply_count         INT NULL COMMENT '回帖计数',
    comment_visible             CHAR NULL COMMENT '0：所有人可见，1：仅楼主和自己可见',
    created_time                DATETIME NULL COMMENT '创建时间'
) COMMENT '评论表 ' COLLATE = utf8mb4_unicode_ci;

CREATE TABLE tu_currency_issue
(
    id           BIGINT AUTO_INCREMENT COMMENT '主键'
        PRIMARY KEY,
    issue_value  DECIMAL(32, 8) NULL COMMENT '发行数额',
    created_by   BIGINT NULL COMMENT '发行人',
    created_time DATETIME NULL COMMENT '发行时间'
) COMMENT '货币发行表 ' COLLATE = utf8mb4_unicode_ci;

CREATE TABLE tu_currency_rule
(
    id               BIGINT AUTO_INCREMENT COMMENT '主键'
        PRIMARY KEY,
    rule_name        VARCHAR(128) NULL COMMENT '规则名称',
    rule_sign        VARCHAR(64) NULL COMMENT '规则标志(与枚举变量对应)',
    rule_description VARCHAR(1024) NULL COMMENT '规则描述',
    money            DECIMAL(32, 8) NULL COMMENT '金额',
    award_status     CHAR DEFAULT '0' NULL COMMENT '奖励(0)/消耗(1)状态',
    maximum_money    DECIMAL(32, 8) NULL COMMENT '上限金额',
    repeat_days      INT  DEFAULT 0 NULL COMMENT '重复(0: 不重复,单位:天)',
    STATUS           CHAR DEFAULT '0' NULL COMMENT '状态'
) COMMENT '货币规则表 ' COLLATE = utf8mb4_unicode_ci;

CREATE TABLE tu_follow
(
    id             BIGINT AUTO_INCREMENT COMMENT '主键'
        PRIMARY KEY,
    follower_id    BIGINT NULL COMMENT '关注者 id',
    following_id   BIGINT NULL COMMENT '关注数据 id',
    following_type CHAR NULL COMMENT '0：用户，1：标签，2：帖子收藏，3：帖子关注'
) COMMENT '关注表 ' COLLATE = utf8mb4_unicode_ci;

CREATE TABLE tu_notification
(
    id           BIGINT AUTO_INCREMENT COMMENT '主键'
        PRIMARY KEY,
    id_user      BIGINT NULL COMMENT '用户id',
    data_type    CHAR NULL COMMENT '数据类型',
    data_id      BIGINT NULL COMMENT '数据id',
    has_read     CHAR DEFAULT '0' NULL COMMENT '是否已读',
    data_summary VARCHAR(256) NULL COMMENT '数据摘要',
    created_time DATETIME NULL COMMENT '创建时间'
) COMMENT '通知表 ' COLLATE = utf8mb4_unicode_ci;

CREATE TABLE tu_portfolio
(
    id                         BIGINT AUTO_INCREMENT COMMENT '主键'
        PRIMARY KEY,
    portfolio_head_img_url     VARCHAR(500) NULL COMMENT '作品集头像',
    portfolio_title            VARCHAR(32) NULL COMMENT '作品集名称',
    portfolio_author_id        BIGINT NULL COMMENT '作品集作者',
    portfolio_description      VARCHAR(1024) NULL COMMENT '作品集介绍',
    created_time               DATETIME NULL COMMENT '创建时间',
    updated_time               DATETIME NULL COMMENT '更新时间',
    portfolio_description_html VARCHAR(1024) NULL COMMENT ' 作品集介绍HTML'
) COMMENT '作品集表' COLLATE = utf8mb4_unicode_ci;

CREATE TABLE tu_portfolio_article
(
    id           BIGINT AUTO_INCREMENT COMMENT '主键'
        PRIMARY KEY,
    id_portfolio BIGINT NULL COMMENT '作品集表主键',
    id_article   BIGINT NULL COMMENT '文章表主键',
    sort_no      INT NULL COMMENT '排序号'
) COMMENT '作品集与文章关系表' COLLATE = utf8mb4_unicode_ci;

CREATE TABLE tu_role
(
    id           BIGINT AUTO_INCREMENT COMMENT '主键'
        PRIMARY KEY,
    NAME         VARCHAR(32) NULL COMMENT '名称',
    input_code   VARCHAR(32) NULL COMMENT '拼音码',
    STATUS       CHAR    DEFAULT '0' NULL COMMENT '状态',
    created_time DATETIME NULL COMMENT '创建时间',
    updated_time DATETIME NULL COMMENT '更新时间',
    weights      TINYINT DEFAULT 0 NULL COMMENT '权重,数值越小权限越大;0:无权限'
) COMMENT ' ' COLLATE = utf8mb4_unicode_ci;

CREATE TABLE tu_sponsor
(
    id                BIGINT AUTO_INCREMENT COMMENT '主键'
        PRIMARY KEY,
    data_type         CHAR NULL COMMENT '数据类型',
    data_id           BIGINT NULL COMMENT '数据主键',
    sponsor           BIGINT NULL COMMENT '赞赏人',
    sponsorship_time  DATETIME NULL COMMENT '赞赏日期',
    sponsorship_money DECIMAL(32, 8) NULL COMMENT '赞赏金额'
) COMMENT '赞赏表 ' COLLATE = utf8mb4_unicode_ci;

CREATE TABLE tu_tag
(
    id                   BIGINT AUTO_INCREMENT COMMENT '主键'
        PRIMARY KEY,
    tag_title            VARCHAR(32) NULL COMMENT '标签名',
    tag_icon_path        VARCHAR(512) NULL COMMENT '标签图标',
    tag_uri              VARCHAR(128) NULL COMMENT '标签uri',
    tag_description      TEXT NULL COMMENT '描述',
    tag_view_count       INT  DEFAULT 0 NULL COMMENT '浏览量',
    tag_article_count    INT  DEFAULT 0 NULL COMMENT '关联文章总数',
    tag_ad               CHAR NULL COMMENT '标签广告',
    tag_show_side_ad     CHAR NULL COMMENT '是否显示全站侧边栏广告',
    created_time         DATETIME NULL COMMENT '创建时间',
    updated_time         DATETIME NULL COMMENT '更新时间',
    tag_status           CHAR DEFAULT '0' NULL COMMENT '标签状态',
    tag_reservation      CHAR DEFAULT '0' NULL COMMENT '保留标签',
    tag_description_html TEXT NULL
) COMMENT '标签表 ' COLLATE = utf8mb4_unicode_ci;

CREATE TABLE tu_tag_article
(
    id                    BIGINT AUTO_INCREMENT COMMENT '主键'
        PRIMARY KEY,
    id_tag                BIGINT NULL COMMENT '标签 id',
    id_article            VARCHAR(32) NULL COMMENT '帖子 id',
    article_comment_count INT DEFAULT 0 NULL COMMENT '帖子评论计数 0',
    article_perfect       INT DEFAULT 0 NULL COMMENT '0:非优选1：优选 0',
    created_time          DATETIME NULL COMMENT '创建时间',
    updated_time          DATETIME NULL COMMENT '更新时间'
) COMMENT '标签 - 帖子关联表 ' COLLATE = utf8mb4_unicode_ci;

CREATE INDEX tu_tag_article_id_tag_index
    ON tu_tag_article (id_tag);

CREATE TABLE tu_topic
(
    id                     BIGINT AUTO_INCREMENT COMMENT '主键'
        PRIMARY KEY,
    topic_title            VARCHAR(32) NULL COMMENT '专题标题',
    topic_uri              VARCHAR(32) NULL COMMENT '专题路径',
    topic_description      TEXT NULL COMMENT '专题描述',
    topic_type             VARCHAR(32) NULL COMMENT '专题类型',
    topic_sort             INT  DEFAULT 10 NULL COMMENT '专题序号 10',
    topic_icon_path        VARCHAR(128) NULL COMMENT '专题图片路径',
    topic_nva              CHAR DEFAULT '0' NULL COMMENT '0：作为导航1：不作为导航 0',
    topic_tag_count        INT  DEFAULT 0 NULL COMMENT '专题下标签总数 0',
    topic_status           CHAR DEFAULT '0' NULL COMMENT '0：正常1：禁用 0',
    created_time           DATETIME NULL COMMENT '创建时间',
    updated_time           DATETIME NULL COMMENT '更新时间',
    topic_description_html TEXT NULL COMMENT '专题描述 Html'
) COMMENT '主题表' COLLATE = utf8mb4_unicode_ci;

CREATE TABLE tu_topic_tag
(
    id           BIGINT AUTO_INCREMENT COMMENT '主键'
        PRIMARY KEY,
    id_topic     BIGINT NULL COMMENT '专题id',
    id_tag       BIGINT NULL COMMENT '标签id',
    created_time DATETIME NULL COMMENT '创建时间',
    updated_time DATETIME NULL COMMENT '更新时间'
) COMMENT '专题- 标签关联表 ' COLLATE = utf8mb4_unicode_ci;

CREATE INDEX tu_topic_tag_id_topic_index
    ON tu_topic_tag (id_topic);

CREATE TABLE tu_transaction_record
(
    id                BIGINT AUTO_INCREMENT COMMENT '交易主键'
        PRIMARY KEY,
    transaction_no    VARCHAR(32) NULL COMMENT '交易流水号',
    funds             VARCHAR(32) NULL COMMENT '款项',
    form_bank_account VARCHAR(32) NULL COMMENT '交易发起方',
    to_bank_account   VARCHAR(32) NULL COMMENT '交易收款方',
    money             DECIMAL(32, 8) NULL COMMENT '交易金额',
    transaction_type  CHAR DEFAULT '0' NULL COMMENT '交易类型',
    transaction_time  DATETIME NULL COMMENT '交易时间'
) COMMENT '交易记录表 ' COLLATE = utf8mb4_unicode_ci;

CREATE TABLE tu_user
(
    id              BIGINT AUTO_INCREMENT COMMENT '用户ID'
        PRIMARY KEY,
    ACCOUNT         VARCHAR(32) NULL COMMENT '账号',
    PASSWORD        VARCHAR(64) NOT NULL COMMENT '密码',
    nickname        VARCHAR(128) NULL COMMENT '昵称',
    real_name       VARCHAR(32) NULL COMMENT '真实姓名',
    sex             CHAR DEFAULT '0' NULL COMMENT '性别',
    avatar_type     CHAR DEFAULT '0' NULL COMMENT '头像类型',
    avatar_url      VARCHAR(512) NULL COMMENT '头像路径',
    email           VARCHAR(64) NULL COMMENT '邮箱',
    phone           VARCHAR(11) NULL COMMENT '电话',
    STATUS          CHAR DEFAULT '0' NULL COMMENT '状态',
    created_time    DATETIME NULL COMMENT '创建时间',
    updated_time    DATETIME NULL COMMENT '更新时间',
    last_login_time DATETIME NULL COMMENT '最后登录时间',
    signature       VARCHAR(128) NULL COMMENT '签名',
    last_online_time DATETIME NULL COMMENT '最后在线时间',
    bg_img_url       VARCHAR(512)     NULL COMMENT '背景图片'
) COMMENT '用户表 ' COLLATE = utf8mb4_unicode_ci;

CREATE TABLE tu_user_extend
(
    id_user BIGINT NOT NULL COMMENT '用户表主键',
    github  VARCHAR(64) NULL COMMENT 'github',
    weibo   VARCHAR(32) NULL COMMENT '微博',
    weixin  VARCHAR(32) NULL COMMENT '微信',
    qq      VARCHAR(32) NULL COMMENT 'qq',
    blog    VARCHAR(500) NULL COMMENT '博客'
) COMMENT '用户扩展表 ' COLLATE = utf8mb4_unicode_ci;

CREATE TABLE tu_user_role
(
    id_user      BIGINT NOT NULL COMMENT '用户表主键',
    id_role      BIGINT NOT NULL COMMENT '角色表主键',
    created_time DATETIME NULL COMMENT '创建时间'
) COMMENT '用户权限表 ' COLLATE = utf8mb4_unicode_ci;

CREATE TABLE tu_user_tag
(
    id           BIGINT AUTO_INCREMENT COMMENT '主键'
        PRIMARY KEY,
    id_user      BIGINT NULL COMMENT '用户 id',
    id_tag       VARCHAR(32) NULL COMMENT '标签 id',
    TYPE         CHAR NULL COMMENT '0：创建者，1：帖子使用，2：用户自评标签',
    created_time DATETIME NULL COMMENT '创建时间',
    updated_time DATETIME NULL COMMENT '更新时间'
) COMMENT '用户 - 标签关联表 ' COLLATE = utf8mb4_unicode_ci;

CREATE TABLE tu_visit
(
    id                BIGINT AUTO_INCREMENT COMMENT '主键'
        PRIMARY KEY,
    visit_url         VARCHAR(256) NULL COMMENT '浏览链接',
    visit_ip          VARCHAR(128) NULL COMMENT 'IP',
    visit_ua          VARCHAR(512) NULL COMMENT 'User-Agent',
    visit_city        VARCHAR(32) NULL COMMENT '城市',
    visit_device_id   VARCHAR(256) NULL COMMENT '设备唯一标识',
    visit_user_id     BIGINT NULL COMMENT '浏览者 id',
    visit_referer_url VARCHAR(256) NULL COMMENT '上游链接',
    created_time      DATETIME NULL COMMENT '创建时间',
    expired_time      DATETIME NULL COMMENT '过期时间'
) COMMENT '浏览表' COLLATE = utf8mb4_unicode_ci;

CREATE TABLE tu_lucene_user_dic
(
    id  INT AUTO_INCREMENT COMMENT '字典编号',
    dic CHAR(32) NULL COMMENT '字典',
    CONSTRAINT tu_lucene_user_dic_id_uindex
        UNIQUE (id)
) COMMENT '用户扩展字典' COLLATE = utf8mb4_unicode_ci;

ALTER TABLE tu_lucene_user_dic
    ADD PRIMARY KEY (id);

INSERT INTO tu.tu_role (id, NAME, input_code, STATUS, created_time, updated_time, weights)
VALUES (1, '管理员', 'admin', '0', '2019-11-16 04:22:45', '2019-11-16 04:22:45', 1);
INSERT INTO tu.tu_role (id, NAME, input_code, STATUS, created_time, updated_time, weights)
VALUES (2, '社区管理员', 'blog_admin', '0', '2019-12-05 03:10:05', '2019-12-05 17:11:35', 2);
INSERT INTO tu.tu_role (id, NAME, input_code, STATUS, created_time, updated_time, weights)
VALUES (3, '作者', 'zz', '0', '2020-03-12 15:07:27', '2020-03-12 15:07:27', 3);
INSERT INTO tu.tu_role (id, NAME, input_code, STATUS, created_time, updated_time, weights)
VALUES (4, '普通用户', 'user', '0', '2019-12-05 03:10:59', '2020-03-12 15:13:49', 4);

INSERT INTO tu.tu_user (id, ACCOUNT, PASSWORD, nickname, real_name, sex, avatar_type, avatar_url, email, phone,
                                STATUS, created_time, updated_time, last_login_time, signature)
VALUES (1, 'admin', '8ce2dd866238958ac4f07870766813cdaa39a9b83a8c75e26aa50f23', 'admin', 'admin', '0', '0', NULL, 'admin@run.com',
        NULL, '0', '2021-01-25 18:21:51', '2021-01-25 18:21:54', NULL, NULL);
INSERT INTO tu.tu_user (id, ACCOUNT, PASSWORD, nickname, real_name, sex, avatar_type, avatar_url, email, phone,
                                STATUS, created_time, updated_time, last_login_time, signature)
VALUES (2, 'testUser', '8ce2dd866238958ac4f07870766813cdaa39a9b83a8c75e26aa50f23', 'testUser', 'testUser', '0', '0', NULL, 'testUser@run.com',
        NULL, '0', '2021-01-25 18:21:51', '2021-01-25 18:21:54', NULL, NULL);

INSERT INTO tu.tu_user_role (id_user, id_role, created_time)
VALUES (1, 1, '2021-01-25 18:22:12');

CREATE TABLE tu_file
(
    id           INT UNSIGNED AUTO_INCREMENT COMMENT 'id'
        PRIMARY KEY,
    md5_value    VARCHAR(40)  NOT NULL COMMENT '文件md5值',
    file_path    VARCHAR(255) NOT NULL COMMENT '文件上传路径',
    file_url     VARCHAR(255) NOT NULL COMMENT '网络访问路径',
    created_time DATETIME NULL COMMENT '创建时间',
    updated_time DATETIME NULL COMMENT '更新时间',
    created_by   INT NULL COMMENT '创建人',
    file_size    INT NULL COMMENT '文件大小',
    file_type    VARCHAR(10) NULL COMMENT '文件类型'
) COMMENT '文件上传记录表' COLLATE = utf8mb4_unicode_ci;

CREATE INDEX index_md5_value_created_by
    ON tu_file (md5_value, created_by);

CREATE INDEX index_created_by
    ON tu_file (created_by);

CREATE INDEX index_md5_value
    ON tu_file (md5_value);

CREATE TABLE tu_login_record
(
    id              BIGINT AUTO_INCREMENT COMMENT '主键'
        PRIMARY KEY,
    id_user         BIGINT NOT NULL COMMENT '用户表主键',
    login_ip        VARCHAR(128) NULL COMMENT '登录设备IP',
    login_ua        VARCHAR(512) NULL COMMENT '登录设备UA',
    login_city      VARCHAR(128) NULL COMMENT '登录设备所在城市',
    login_os        VARCHAR(64) NULL COMMENT '登录设备操作系统',
    login_browser   VARCHAR(64) NULL COMMENT '登录设备浏览器',
    created_time    DATETIME NULL COMMENT '登录时间',
    login_device_id VARCHAR(512) NULL COMMENT '登录设备/浏览器指纹',
    CONSTRAINT tu_login_record_id_uindex
        UNIQUE (id)
) COMMENT '登录记录表' COLLATE = utf8mb4_unicode_ci;

CREATE TABLE tu_product
(
    id                  INT AUTO_INCREMENT COMMENT '主键'
        PRIMARY KEY,
    product_title       VARCHAR(100)       NULL COMMENT '产品名',
    product_price       INT     DEFAULT 0  NULL COMMENT '单价(单位:分)',
    product_img_url     VARCHAR(100)       NULL COMMENT '产品主图',
    product_description VARCHAR(200)       NULL COMMENT '产品描述',
    weights             TINYINT DEFAULT 50 NULL COMMENT '权重,数值越小权限越大;0:无权限',
    created_time        DATETIME           NULL COMMENT '创建时间',
    updated_time        DATETIME           NULL COMMENT '更新时间',
    CONSTRAINT tu_product_id_uindex
        UNIQUE (id)
)
    COMMENT '产品表';

CREATE TABLE tu_product_content
(
    id_product           INT      NULL COMMENT '产品表主键',
    product_content      TEXT     NULL COMMENT '产品详情原文',
    product_content_html TEXT     NULL COMMENT '产品详情 Html',
    created_time         DATETIME NULL COMMENT '创建时间',
    updated_time         DATETIME NULL COMMENT '更新时间'
)
    COMMENT '产品详情表';

INSERT INTO tu.tu_product (id, product_title, product_price, product_img_url, product_description, weights, created_time, updated_time) VALUES (1, 'Nebula Pi', 2000000, 'https://static.run.com/article/1648960741563.jpg', '产品描述', 20, '2022-06-13 22:35:33', '2022-06-13 22:35:33');

INSERT INTO tu.tu_product_content (id_product, product_content, product_content_html, created_time,
                                           updated_time)
VALUES (1, '![nebula pi](https://static.run.com/article/1640531590770)

Nebula-Pi 开发板平台

## 1.1主板结构及布局

![](https://static.run.com/article/1640531590844)

图1.1 Nebula-Pi 单片机开发平台

## 1.2主板元件说明

从图1.1可以看出， Nebula-Pi 开发板平台资源丰富，不仅涵盖了 51 单片机所有内部资源，还扩展了大量的外设，单片机的各项功能均可以在平台上得到验证。我们以顺时针的顺序从**①**到**⑳**，分别介绍主要模块的功能。

| 序号 | 元器件 | 功能介绍 |
| --- | --- | --- |
| 1 | 迷你 USB 接口 | 给开发板供电，以及计算机与开发板通信 |
| 2 | 单片机跳线帽 | 开发板上有两块独立的 51 单片机，可以通过这个跳线进行切换，选择你需要使用的单片机。 |
| 3 | 电源开关 | 开发板电源开关 |
| 4 |  51 单片机 STC89C52RC | 这套教程的主角， 51 单片机，选用 STC 公司的 STC89C52RC 型号进行讲解 |
| 5 | 液晶显示器跳线帽 | 液晶显示器的跳线，可以选择 OLED 或者 LCD |
| 6 | 主板复位按钮 | 复位按钮，相当于电脑的重启按键 |
| 7 | 数字温度传感器 | 温度传感器，可以测量环境温度 |
| 8 | 红外接收头 | 接收红外遥控信号专用 |
| 9 | 液晶显示器接口 | 预留的液晶显示器 1602/12864 等的接口 |
| 10 | 数码管 | 4 位数码管，可以同时显示 4 个数字等 |
| 11 | 蜂鸣器 | 相当于开发板的小喇叭，可以发出"滴滴"等声音 |
| 12 | 光敏&热敏电阻 | 两种类型的电阻，分别可以用来测量光强度和温度 |
| 13 | 步进电机接口 | 预留给电机的接口 |
| 14 | 8 个 LED 灯 | 8 个 LED 小灯，可实现指示灯，流水灯等效果 |
| 15 | 增强型 51 单片机 STC12 | 开发板上的另外一块 51 单片机，比主角功能更强大，第一块用来学习，这一块用来做项目，学习、实践两不误 |
| 16 | 2.4G 无线模块接口 | 为 2.4G 无线通信模块预留的接口，无线通信距离可以达到 1-2Km，大大扩展了开发板的功能 |
| 17 | 3 个独立按键 | 3 个按键，可以当做开发板的输入设备，相当于迷你版键盘 |
| 18 | 继电器接口 | 开发板上集成了继电器，这个接口预留给用户接线用的，可以用来控制 220V 设备的开关。因此，可以通过开发板來控制各种类型的家用电器 |
| 19 | 电源端子 | 预留了 5V 和 3.3V 的电源端子，可以用来给其他设备供电 |
| 20 | WiFi 模块接口 | WiFi 模块接口，接上 WiFi 模块，开发板可以轻松上网冲浪 |

表 1-1 主板元器件说明

', '<p><img src="https://static.run.com/article/1640531590770" alt="nebula pi" /></p>
<p>Nebula-Pi 开发板平台</p>
<h2 id="1-1主板结构及布局">1.1 主板结构及布局</h2>
<p><img src="https://static.run.com/article/1640531590844" alt="" /></p>
<p>图 1.1 Nebula-Pi 单片机开发平台</p>
<h2 id="1-2主板元件说明">1.2 主板元件说明</h2>
<p>从图 1.1 可以看出， Nebula-Pi 开发板平台资源丰富，不仅涵盖了 51 单片机所有内部资源，还扩展了大量的外设，单片机的各项功能均可以在平台上得到验证。我们以顺时针的顺序从 <strong>①</strong> 到 <strong>⑳</strong>，分别介绍主要模块的功能。</p>
<table>
<thead>
<tr>
<th>序号</th>
<th>元器件</th>
<th>功能介绍</th>
</tr>
</thead>
<tbody>
<tr>
<td>1</td>
<td>迷你 USB 接口</td>
<td>给开发板供电，以及计算机与开发板通信</td>
</tr>
<tr>
<td>2</td>
<td>单片机跳线帽</td>
<td>开发板上有两块独立的 51 单片机，可以通过这个跳线进行切换，选择你需要使用的单片机。</td>
</tr>
<tr>
<td>3</td>
<td>电源开关</td>
<td>开发板电源开关</td>
</tr>
<tr>
<td>4</td>
<td>51 单片机 STC89C52RC</td>
<td>这套教程的主角， 51 单片机，选用 STC 公司的 STC89C52RC 型号进行讲解</td>
</tr>
<tr>
<td>5</td>
<td>液晶显示器跳线帽</td>
<td>液晶显示器的跳线，可以选择 OLED 或者 LCD</td>
</tr>
<tr>
<td>6</td>
<td>主板复位按钮</td>
<td>复位按钮，相当于电脑的重启按键</td>
</tr>
<tr>
<td>7</td>
<td>数字温度传感器</td>
<td>温度传感器，可以测量环境温度</td>
</tr>
<tr>
<td>8</td>
<td>红外接收头</td>
<td>接收红外遥控信号专用</td>
</tr>
<tr>
<td>9</td>
<td>液晶显示器接口</td>
<td>预留的液晶显示器 1602/12864 等的接口</td>
</tr>
<tr>
<td>10</td>
<td>数码管</td>
<td>4 位数码管，可以同时显示 4 个数字等</td>
</tr>
<tr>
<td>11</td>
<td>蜂鸣器</td>
<td>相当于开发板的小喇叭，可以发出&quot;滴滴&quot;等声音</td>
</tr>
<tr>
<td>12</td>
<td>光敏&amp;热敏电阻</td>
<td>两种类型的电阻，分别可以用来测量光强度和温度</td>
</tr>
<tr>
<td>13</td>
<td>步进电机接口</td>
<td>预留给电机的接口</td>
</tr>
<tr>
<td>14</td>
<td>8 个 LED 灯</td>
<td>8 个 LED 小灯，可实现指示灯，流水灯等效果</td>
</tr>
<tr>
<td>15</td>
<td>增强型 51 单片机 STC12</td>
<td>开发板上的另外一块 51 单片机，比主角功能更强大，第一块用来学习，这一块用来做项目，学习、实践两不误</td>
</tr>
<tr>
<td>16</td>
<td>2.4G 无线模块接口</td>
<td>为 2.4G 无线通信模块预留的接口，无线通信距离可以达到 1-2Km，大大扩展了开发板的功能</td>
</tr>
<tr>
<td>17</td>
<td>3 个独立按键</td>
<td>3 个按键，可以当做开发板的输入设备，相当于迷你版键盘</td>
</tr>
<tr>
<td>18</td>
<td>继电器接口</td>
<td>开发板上集成了继电器，这个接口预留给用户接线用的，可以用来控制 220V 设备的开关。因此，可以通过开发板來控制各种类型的家用电器</td>
</tr>
<tr>
<td>19</td>
<td>电源端子</td>
<td>预留了 5V 和 3.3V 的电源端子，可以用来给其他设备供电</td>
</tr>
<tr>
<td>20</td>
<td>WiFi 模块接口</td>
<td>WiFi 模块接口，接上 WiFi 模块，开发板可以轻松上网冲浪</td>
</tr>
</tbody>
</table>
<p>表 1-1 主板元器件说明</p>
', '2022-06-13 22:35:34', '2022-06-13 22:35:34');

INSERT INTO tu.tu_bank (id, bank_name, bank_owner, bank_description, created_by, created_time) VALUES (1, '社区中央银行', 1, '社区中央银行', 1, '2020-11-26 21:24:19');
INSERT INTO tu.tu_bank (id, bank_name, bank_owner, bank_description, created_by, created_time) VALUES (2, '社区发展与改革银行', 1, '社区发展与改革银行', 1, '2020-11-26 21:31:27');


INSERT INTO tu.tu_bank_account (id, id_bank, bank_account, account_balance, account_owner, created_time, account_type) VALUES (2, 1, '100000002', 1207980.00000000, 2, '2020-11-26 21:37:18', '1');
INSERT INTO tu.tu_bank_account (id, id_bank, bank_account, account_balance, account_owner, created_time, account_type) VALUES (1, 1, '100000001', 997500000.00000000, 1, '2020-11-26 21:36:21', '1');
