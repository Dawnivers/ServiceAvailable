package com.dawnivers.be; //对应com/dawnivers/be

import org.springframework.boot.SpringApplication;         
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication       

public class BeApplication {

    public static void main(String[] args) {               
        SpringApplication.run(BeApplication.class, args);
    }
}

// package com.新公司.新项目;                              // ① 包名

// @SpringBootApplication
// public class 新名字Application {                        // ② 类名（文件名要一致）

//     public static void main(String[] args) {
//         SpringApplication.run(新名字Application.class, args);   // ③ 这里跟着改
//     }
// }