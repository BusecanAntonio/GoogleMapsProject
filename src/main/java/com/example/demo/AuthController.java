package com.example.demo;

import org.springframework.web.bind.annotation.*;
import org.springframework.beans.factory.annotation.Autowired;

@RestController
public class AuthController {

    @Autowired
    private UserService userService;

    @PostMapping("/signup")
    public String signUp(@RequestBody AppUser user) {
        userService.saveUser(user);
        return "User created";
    }

    @PostMapping("/login")
    public String login(@RequestBody AppUser user) {
        boolean ok = userService.verifyUser(user.getUsername(), user.getPassword());
        return ok ? "Login success" : "Invalid credentials";
    }
}
