package org.zhitui.tu.controller.bank;

import com.github.pagehelper.PageHelper;
import com.github.pagehelper.PageInfo;
import org.zhitui.tu.core.result.GlobalResult;
import org.zhitui.tu.core.result.GlobalResultGenerator;
import org.zhitui.tu.dto.BankAccountDTO;
import org.zhitui.tu.dto.TransactionRecordDTO;
import org.zhitui.tu.entity.BankAccount;
import org.zhitui.tu.entity.User;
import org.zhitui.tu.service.BankAccountService;
import org.zhitui.tu.util.UserUtils;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;
import javax.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Objects;

/**
 * Created on 2021/12/10 19:25.
 *
 * @author ronger
 * @email ronger-x@outlook.com
 */
@RestController
@RequestMapping("/api/v1/wallet")
public class WalletController {

    @Resource
    private BankAccountService bankAccountService;


    @GetMapping("/detail")
    public GlobalResult<BankAccountDTO> detail() {
        User user = UserUtils.getCurrentUserByToken();
        BankAccountDTO bankAccount = bankAccountService.findBankAccountByIdUser(user.getIdUser());
        return GlobalResultGenerator.genSuccessResult(bankAccount);
    }

    @GetMapping("/transaction-records")
    public GlobalResult<PageInfo<TransactionRecordDTO>> transactionRecords(@RequestParam(defaultValue = "0") Integer page, @RequestParam(defaultValue = "20") Integer rows, HttpServletRequest request) {
        User user = UserUtils.getCurrentUserByToken();
        String startDate = request.getParameter("startDate");
        String endDate = request.getParameter("endDate");
        BankAccountDTO bankAccount = bankAccountService.findBankAccountByIdUser(user.getIdUser());
        if (Objects.isNull(bankAccount)) {
            return GlobalResultGenerator.genSuccessResult(new PageInfo<>());
        }
        PageHelper.startPage(page, rows);
        List<TransactionRecordDTO> list = bankAccountService.findUserTransactionRecords(bankAccount.getBankAccount(), startDate, endDate);
        PageInfo<TransactionRecordDTO> pageInfo = new PageInfo(list);
        return GlobalResultGenerator.genSuccessResult(pageInfo);
    }

    @PostMapping("/create")
    public GlobalResult<BankAccount> create() {
        User user = UserUtils.getCurrentUserByToken();
        return GlobalResultGenerator.genSuccessResult(bankAccountService.createBankAccount(user.getIdUser()));
    }
}
