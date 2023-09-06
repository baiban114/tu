package org.zhitui.tu.service;

import org.zhitui.tu.core.service.Service;
import org.zhitui.tu.dto.TransactionRecordDTO;
import org.zhitui.tu.entity.TransactionRecord;
import org.zhitui.tu.enumerate.TransactionEnum;

import java.util.List;

/**
 * @author ronger
 */
public interface TransactionRecordService extends Service<TransactionRecord> {
    /**
     * 交易
     *
     * @param transactionRecord
     * @return
     */
    TransactionRecord transfer(TransactionRecord transactionRecord);

    /**
     * 查询指定账户的交易记录
     *
     * @param bankAccount
     * @param startDate
     * @param endDate
     * @return
     */
    List<TransactionRecordDTO> findTransactionRecords(String bankAccount, String startDate, String endDate);

    /**
     * 根据用户主键进行交易
     *
     * @param toUserId
     * @param formUserId
     * @param transactionType
     * @return
     */
    TransactionRecord userTransfer(Long toUserId, Long formUserId, TransactionEnum transactionType);

    /**
     * 社区银行转账/奖励发放
     *
     * @param idUser
     * @param transactionType
     * @return
     */
    TransactionRecord bankTransfer(Long idUser, TransactionEnum transactionType);

    /**
     * 发放新手奖励
     *
     * @param transactionRecord
     * @return
     */
    TransactionRecord newbieRewards(TransactionRecord transactionRecord);
}
