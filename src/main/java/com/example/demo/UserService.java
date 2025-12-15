package com.example.demo;

import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;

@Service
public class UserService {

    @Autowired
    private UserRepository repo;

    // Save user in Neo4j
    public void saveUser(AppUser user) {
        repo.save(user);
    }

    // Verify username and password
    public boolean verifyUser(String username, String password) {
        AppUser u = repo.findByUsername(username);
        return u != null && u.getPassword().equals(password);
    }
}
