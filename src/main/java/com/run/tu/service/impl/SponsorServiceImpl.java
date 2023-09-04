package com.run.tu.service.impl;


import com.run.tu.core.exception.ServiceException;
import com.run.tu.core.exception.TransactionException;
import com.run.tu.core.service.AbstractService;
import com.run.tu.dto.ArticleDTO;
import com.run.tu.entity.Sponsor;
import com.run.tu.entity.TransactionRecord;
import com.run.tu.enumerate.TransactionCode;
import com.run.tu.enumerate.TransactionEnum;
import com.run.tu.mapper.SponsorMapper;
import com.run.tu.service.ArticleService;
import com.run.tu.service.SponsorService;
import com.run.tu.service.TransactionRecordService;
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
