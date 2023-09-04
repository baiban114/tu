package com.run.tu.controller.tag;

import com.github.pagehelper.PageHelper;
import com.github.pagehelper.PageInfo;
import com.run.tu.core.result.GlobalResult;
import com.run.tu.core.result.GlobalResultGenerator;
import com.run.tu.dto.ArticleDTO;
import com.run.tu.dto.LabelModel;
import com.run.tu.service.ArticleService;
import com.run.tu.service.TagService;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;
import java.util.List;

/**
 * @author ronger
 */
@RestController
@RequestMapping("/api/v1/tag")
public class TagController {

    @Resource
    private ArticleService articleService;
    @Resource
    private TagService tagService;

    @GetMapping("/{name}")
    public GlobalResult<PageInfo<ArticleDTO>> articles(@RequestParam(defaultValue = "0") Integer page, @RequestParam(defaultValue = "10") Integer rows, @PathVariable String name) {
        PageHelper.startPage(page, rows);
        List<ArticleDTO> list = articleService.findArticlesByTagName(name);
        PageInfo<ArticleDTO> pageInfo = new PageInfo(list);
        return GlobalResultGenerator.genSuccessResult(pageInfo);
    }

    @GetMapping("/tags")
    public GlobalResult tags() {
        List<LabelModel> list = tagService.findTagLabels();
        return GlobalResultGenerator.genSuccessResult(list);
    }
}
