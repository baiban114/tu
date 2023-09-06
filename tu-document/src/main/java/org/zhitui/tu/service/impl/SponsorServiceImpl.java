package org.zhitui.tu.service.impl;


import org.zhitui.tu.core.exception.ServiceException;
import org.zhitui.tu.core.exception.TransactionException;
import org.zhitui.tu.core.service.AbstractService;
import org.zhitui.tu.dto.ArticleDTO;
import org.zhitui.tu.entity.Sponsor;
import org.zhitui.tu.entity.TransactionRecord;
import org.zhitui.tu.enumerate.TransactionCode;
import org.zhitui.tu.enumerate.TransactionEnum;
import org.zhitui.tu.mapper.SponsorMapper;
import org.zhitui.tu.service.ArticleService;
import org.zhitui.tu.service.SponsorService;
import org.zhitui.tu.service.TransactionRecordService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.annotation.Resource;
import java.math.BigDecimal;
import java.util.Date;
import java.util.Objects;

/**
 * @author ronger
 */
@Service
public class SponsorServiceImpl extends AbstractService<Sponsor> implements SponsorService {

    @Resource
    private SponsorMapper sponsorMapper;
    @Resource
    private ArticleService articleService;
    @Resource
    private TransactionRecordService transactionRecordService;

    @Override
    @Transactional(rollbackFor = ServiceException.class)
    public boolean sponsorship(Sponsor sponsor) throws ServiceException {
        TransactionEnum transactionEnum = TransactionEnum.findTransactionEnum(sponsor.getDataType());
        BigDecimal money = BigDecimal.valueOf(transactionEnum.getMoney());
        sponsor.setSponsorshipMoney(money);
        sponsor.setSponsorshipTime(new Date());
        sponsorMapper.insertSelective(sponsor);
        // 赞赏金额划转
        if (transactionEnum.isArticleSponsor()) {
            ArticleDTO articleDTO = articleService.findArticleDTOById(sponsor.getDataId(), 1);
            TransactionRecord transactionRecord = transactionRecordService.userTransfer(articleDTO.getArticleAuthorId(), sponsor.getSponsor(), transactionEnum);
            if (Objects.isNull(transactionRecord.getIdTransactionRecord())) {
                throw new TransactionException(TransactionCode.INSUFFICIENT_BALANCE);
            }
            // 更新文章赞赏数
            int result = sponsorMapper.updateArticleSponsorCount(articleDTO.getIdArticle());
            if (result == 0) {
                throw new ServiceException("操作失败!");
            }
        }
        return true;
    }
}
