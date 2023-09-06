package org.zhitui.tu.core.exception;

import org.zhitui.tu.enumerate.TransactionCode;

/**
 * @author ronger
 */
public class TransactionException extends BusinessException {

    private int code;

    private String message;

    public TransactionException(TransactionCode transactionCode) {
        super(transactionCode.getMessage());
        this.code = transactionCode.getCode();
    }

    public int getCode() {
        return code;
    }
}
