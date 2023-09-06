package org.zhitui.tu.core.service.log.annotation;

import org.zhitui.tu.enumerate.TransactionEnum;

import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;

/**
 * @author ronger
 */
@Retention(RetentionPolicy.RUNTIME)
public @interface TransactionLogger {

    TransactionEnum transactionType();

}
