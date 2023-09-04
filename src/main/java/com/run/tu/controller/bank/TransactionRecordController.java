package com.run.tu.controller.bank;

import com.run.tu.core.result.GlobalResult;
import com.run.tu.core.result.GlobalResultGenerator;
import com.run.tu.entity.TransactionRecord;
import com.run.tu.service.TransactionRecordService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.annotation.Resource;

/**
 * @author ronger
 */
@RestController
@RequestMapping("/api/v1/transaction")
public class TransactionRecordController {

    @Resource
    private TransactionRecordService transactionRecordService;

    @PostMapping("/transfer")
    public GlobalResult transfer(@RequestBody TransactionRecord transactionRecord) {
        transactionRecord = transactionRecordService.transfer(transactionRecord);
        return GlobalResultGenerator.genSuccessResult(transactionRecord);
    }

    @PostMapping("/newbie-rewards")
    public GlobalResult newbieRewards(@RequestBody TransactionRecord transactionRecord) {
        transactionRecord = transactionRecordService.newbieRewards(transactionRecord);
        return GlobalResultGenerator.genSuccessResult(transactionRecord);
    }

}
