package com.run.tu.core.service.security.annotation;

import com.run.tu.enumerate.Module;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Created on 2022/1/5 19:46.
 *
 * @author ronger
 * @email ronger-x@outlook.com
 */

@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface AuthorshipInterceptor {
    Module moduleName();
}
