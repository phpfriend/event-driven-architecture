const express = require("express");
const { getAllProducts } = require("../lib/dynamodb");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const products = await getAllProducts();
    products.sort((a, b) => a.productId.localeCompare(b.productId));
    res.json(products);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
