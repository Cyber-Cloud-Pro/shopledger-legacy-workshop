var test = require('node:test');
var assert = require('node:assert/strict');
var pricing = require('../lib/pricing');
var invoice = require('../lib/invoice');
var reports = require('../lib/reports');

test('invoice figures match checkout totals and line GST for an HSN-only order', function () {
  var items = [{ id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 }];
  var checkout = pricing.computeTotals(items, '');
  var invoiceFigures = invoice.computeInvoiceFigures({ items: items, coupon: '' });

  assert.equal(invoiceFigures.tax, checkout.tax);
  assert.equal(invoiceFigures.cgst, checkout.cgst);
  assert.equal(invoiceFigures.sgst, checkout.sgst);
  assert.equal(invoiceFigures.total, checkout.total);
  assert.equal(invoiceFigures.rows[0].gstPercent, checkout.lines[0].gstPercent);
  assert.equal(invoiceFigures.rows[0].lineTax, checkout.lines[0].tax);
});

test('invoice uses the checkout HSN slab when gstRate is absent', function () {
  var items = [{ id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 }];
  var checkout = pricing.computeTotals(items, '');
  var invoiceFigures = invoice.computeInvoiceFigures({ items: items, coupon: '' });

  assert.equal(checkout.tax, 5);
  assert.equal(checkout.total, 105);
  assert.equal(invoiceFigures.tax, 5);
  assert.equal(invoiceFigures.total, 105);
});

test('invoice and checkout interpret a decimal gstRate consistently', function () {
  var items = [{ id: 1, name: 'Rice', hsn: '1006', gstRate: 0.05, price: 100, qty: 1 }];
  var checkout = pricing.computeTotals(items, '');
  var invoiceFigures = invoice.computeInvoiceFigures({ items: items, coupon: '' });

  assert.equal(checkout.tax, 5);
  assert.equal(checkout.total, 105);
  assert.equal(invoiceFigures.rows[0].gstPercent, 5);
  assert.equal(invoiceFigures.tax, 5);
  assert.equal(invoiceFigures.total, 105);
});

test('invoice uses the checkout coupon cap and post-discount tax', function () {
  var items = [{ id: 1, name: 'Bulk goods', hsn: '1006', price: 2000, qty: 1 }];
  var order = {
    id: 1001,
    date: '2026-11-22',
    customer: 'Customer',
    items: items,
    coupon: 'SAVE10'
  };
  var checkout = pricing.computeTotals(items, 'SAVE10');
  order.subtotal = checkout.subtotal;
  order.discount = checkout.discount;
  order.tax = checkout.tax;
  order.total = checkout.total;
  var invoiceFigures = invoice.computeInvoiceFigures(order);

  assert.equal(checkout.discount, 150);
  assert.equal(checkout.tax, 92.5);
  assert.equal(checkout.total, 1942.5);
  assert.equal(invoiceFigures.discount, checkout.discount);
  assert.equal(invoiceFigures.tax, checkout.tax);
  assert.equal(invoiceFigures.total, checkout.total);
});

test('GST reconciliation matches invoice figures to the checkout ledger', function () {
  var db = {
    orders: [{
      id: 7,
      date: '2026-11-22',
      customer: 'Customer',
      items: [{ id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 }],
      coupon: '',
      subtotal: 100,
      discount: 0,
      tax: 5,
      total: 105
    }]
  };

  var result = reports.getGstReconciliation(db);

  assert.equal(result.totalChecked, 1);
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.rows[0].delta, 0);
  assert.equal(result.rows[0].matched, true);
  assert.equal(result.rows[0].invoiceTax, 5);
  assert.equal(result.totalDelta, 0);
});

test('rendered invoice shows the checkout tax and total without a reconciliation notice', function () {
  var html = invoice.render({
    id: 8,
    date: '2026-11-22',
    customer: 'Customer',
    items: [{ id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 }],
    coupon: '',
    subtotal: 100,
    discount: 0,
    tax: 5,
    total: 105
  });

  assert.match(html, /CGST \+ SGST \(Total GST\)<\/td><td class="r">₹5\.00/);
  assert.match(html, /Invoice Total<\/td><td class="r">₹105\.00/);
  assert.doesNotMatch(html, /Accountant Reconciliation Notice/);
});
