package com.run.tu.service.impl;

import com.run.tu.core.exception.TransactionException;
import com.run.tu.core.service.AbstractService;
import com.run.tu.core.service.redis.RedisService;
import com.run.tu.dto.BankAccountDTO;
import com.run.tu.dto.TransactionRecordDTO;
import com.run.tu.entity.BankAccount;
import com.run.tu.entity.TransactionRecord;
import com.run.tu.enumerate.TransactionCode;
import com.run.tu.enumerate.TransactionEnum;
import com.run.tu.mapper.BankAccountMapper;
import com.run.tu.mapper.TransactionRecordMapper;
import com.run.tu.service.TransactionRecordService;
import com.run.tu.util.DateUtil;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.annotation.Resource;
import java.math.BigDecimal;
import java.util.*;
import java.util.concurrent.locks.ReentrantLock;

/**
 * @author ronger
 */
@Service
public class TransactionRecordServiceImpl extends AbstractService<TransactionRecord> implements TransactionRecordService {
    @Resource
    private TransactionRecordMapper transactionRecordMapper;
    @Resource
    private BankAccountMapper bankAccountMapper;
    @Resource
    private RedisService redisService;
    private final Map<String, ReentrantLock> userTransferLocks = new HashMap<>();

    @Override
    @Transactional(rollbackFor = Exception.class)
    public TransactionRecord transfer(TransactionRecord transactionRecord) {
        ReentrantLock lock = getUserTransferLocks(transactionRecord.getFormBankAccount());
        lock.lock();
        try {
            // 判断发起者账户状态
            boolean formAccountStatus = checkFormAccountStatus(transactionRecord.getFormBankAccount(), transactionRecord.getMoney());
            boolean toAccountStatus = checkFormAccountStatus(transactionRecord.getToBankAccount(), BigDecimal.valueOf(0));
            if (formAccountStatus && toAccountStatus) {
                Integer result = transactionRecordMapper.debit(transactionRecord.getFormBankAccount(), transactionRecord.getMoney());
                if (result > 0) {
                    result = transactionRecordMapper.credit(transactionRecord.getToBankAccount(), transactionRecord.getMoney());
                    if (result > 0) {
                        transactionRecord.setTransactionNo(nextTransactionNo());
                        transactionRecord.setTransactionTime(new Date());
                        transactionRecordMapper.insertSelective(transactionRecord);
                        return transactionRecord;
                    }
                }
            } else if (toAccountStatus) {
                throw new TransactionException(TransactionCode.INSUFFICIENT_BALANCE);
            } else {
                throw new TransactionException(TransactionCode.UNKNOWN_ACCOUNT);
            }
        } finally {
            lock.unlock();
        }
        throw new TransactionException(TransactionCode.FAIL);
    }

    private ReentrantLock getUserTransferLocks(String formBankAccount) {
        synchronized (userTransferLocks) {
            ReentrantLock lock = userTransferLocks.get(formBankAccount);
            if (lock == null) {
                lock = new ReentrantLock();
                userTransferLocks.put(formBankAccount, lock);
            }
            return lock;
        }
    }

    @Override
    public List<TransactionRecordDTO> findTransactionRecords(String bankAccount, String startDate, String endDate) {
        List<TransactionRecordDTO> list = transactionRecordMapper.selectTransactionRecords(bankAccount, startDate, endDate);
        list.forEach(this::genTransactionRecord);
        return list;
    }

    private TransactionRecordDTO genTransactionRecord(TransactionRecordDTO transactionRecordDTO) {
        BankAccountDTO toBankAccount = bankAccountMapper.selectByBankAccount(transactionRecordDTO.getToBankAccount());
        BankAccountDTO formBankAccount = bankAccountMapper.selectByBankAccount(transactionRecordDTO.getFormBankAccount());
        transactionRecordDTO.setFormBankAccountInfo(formBankAccount);
        transactionRecordDTO.setToBankAccountInfo(toBankAccount);
        return transactionRecordDTO;
    }

    @Override
    public TransactionRecord userTransfer(Long toUserId, Long formUserId, TransactionEnum transactionType) {
        BankAccountDTO toBankAccount = bankAccountMapper.findPersonBankAccountByIdUser(toUserId);
        BankAccountDTO formBankAccount = bankAccountMapper.findPersonBankAccountByIdUser(formUserId);
        if (Objects.isNull(toBankAccount) || Objects.isNull(formBankAccount)) {
            throw new TransactionException(TransactionCode.UNKNOWN_ACCOUNT);
        }
        TransactionRecord transactionRecord = new TransactionRecord();
        transactionRecord.setToBankAccount(toBankAccount.getBankAccount());
        transactionRecord.setFormBankAccount(formBankAccount.getBankAccount());
        transactionRecord.setMoney(new BigDecimal(transactionType.getMoney()));
        transactionRecord.setFunds(transactionType.getDescription());
        return transfer(transactionRecord);
    }

    @Override
    public TransactionRecord bankTransfer(Long idUser, TransactionEnum transactionType) {
        BankAccountDTO toBankAccount = bankAccountMapper.findPersonBankAccountByIdUser(idUser);
        if (Objects.isNull(toBankAccount)) {
            throw new TransactionException(TransactionCode.UNKNOWN_ACCOUNT);
        }
        Boolean isTrue;
        // 校验货币规则
        switch (transactionType) {
            case Answer:
            case CorrectAnswer:
                isTrue = transactionRecordMapper.existsWithBankAccountAndFunds(toBankAccount.getBankAccount(), transactionType.getDescription());
                break;
            default:
                isTrue = true;
        }
        if (isTrue) {
            BankAccount formBankAccount = findSystemBankAccount();
            TransactionRecord transactionRecord = new TransactionRecord();
            transactionRecord.setToBankAccount(toBankAccount.getBankAccount());
            transactionRecord.setFormBankAccount(formBankAccount.getBankAccount());
            transactionRecord.setMoney(new BigDecimal(transactionType.getMoney()));
            transactionRecord.setFunds(transactionType.getDescription());
            return transfer(transactionRecord);
        }
        return null;
    }

    private BankAccount findSystemBankAccount() {
        BankAccount bankAccount = new BankAccount();
        bankAccount.setIdBank(1L);
        bankAccount.setAccountType("1");
        bankAccount.setAccountOwner(2L);
        return bankAccountMapper.selectOne(bankAccount);
    }

    @Override
    public TransactionRecord newbieRewards(TransactionRecord transactionRecord) {
        // 判断是否重复发放
        Boolean result = transactionRecordMapper.existsWithNewbieRewards(transactionRecord.getToBankAccount());
        if (result) {
            return transactionRecord;
        }
        BankAccount formBankAccount = findSystemBankAccount();
        transactionRecord.setFormBankAccount(formBankAccount.getBankAccount());
        transactionRecord.setMoney(new BigDecimal(TransactionEnum.NewbieRewards.getMoney()));
        transactionRecord.setFunds(TransactionEnum.NewbieRewards.getDescription());
        return transfer(transactionRecord);
    }

    private String nextTransactionNo() {
        String orderNo = "E";
        String key = "orderId";
        int timeout = 60;
        //根据时间获取前缀
        String prefix = getPrefix(new Date());
        //使用redis获取自增ID
        long id = redisService.incrBy(key, timeout);
        return orderNo + prefix + DateUtil.getNowDateNum() + String.format("%1$05d", id);
    }

    private static String getPrefix(Date date) {
        Calendar c = Calendar.getInstance();
        c.setTime(date);
        int year = c.get(Calendar.YEAR);
        int day = c.get(Calendar.DAY_OF_YEAR);
        int hour = c.get(Calendar.HOUR_OF_DAY);
        //天数转为3位字符串,不满3位用0补齐
        String dayFmt = String.format("%1$03d", day);
        //小时转为2位字符串,不满2位用0补齐
        String hourFmt = String.format("%1$02d", hour);
        //2位年份+3位天数+2位小时
        return (year - 2000) + dayFmt + hourFmt;
    }

    private boolean checkFormAccountStatus(String formBankAccount, BigDecimal money) {
        BankAccount bankAccount = findInfoByBankAccount(formBankAccount);
        if (Objects.nonNull(bankAccount)) {
            return bankAccount.getAccountBalance().compareTo(money) >= 0;
        }
        return false;
    }

    private BankAccount findInfoByBankAccount(String bankAccount) {
        BankAccount searchBankAccount = new BankAccount();
        searchBankAccount.setBankAccount(bankAccount);
        return bankAccountMapper.selectOne(searchBankAccount);
    }
}
