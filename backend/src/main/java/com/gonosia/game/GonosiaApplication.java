package com.gonosia.game;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class GonosiaApplication {
  public static void main(String[] args) {
    SpringApplication.run(GonosiaApplication.class, args);
  }
}
