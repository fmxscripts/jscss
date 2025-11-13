// jquery-confirm Promise helpers (ES5+)
window.JC = (function($){
  function alert(content, opts){
    opts = opts || {};
    var title = opts.title || 'Alerta';
    var type = opts.type || 'blue';
    return new Promise(function(resolve){
      $.alert({ title: title, content: content, type: type,
        buttons: { ok: { text: opts.okText || 'OK', btnClass: 'btn-' + type, action: resolve } }
      });
    });
  }
  function confirm(content, opts){
    opts = opts || {};
    var title = opts.title || 'Confirmar';
    var type = opts.type || 'blue';
    return new Promise(function(resolve, reject){
      $.confirm({
        title: title, content: content, type: type,
        buttons: {
          cancelar: { text: opts.cancelText || 'Cancelar', action: function(){ reject(false); } },
          ok: { text: opts.okText || 'Sí', btnClass: 'btn-' + type, action: function(){ resolve(true); } }
        }
      });
    });
  }
  function prompt(label, opts){
    label = label || 'Valor';
    opts = opts || {};
    var type = opts.type || 'blue';
    return new Promise(function(resolve, reject){
      $.confirm({
        title: opts.title || 'Ingresar dato',
        type: type,
        content: [
          '<div class="jc-field">',
          '  <label>' + label + '</label>',
          '  <input type="text" class="jc-input" value="' + (opts.value || '') + '">',
          '</div>'
        ].join(''),
        buttons: {
          cancelar: { text: opts.cancelText || 'Cancelar', action: function(){ reject(null); } },
          ok: {
            text: opts.okText || 'OK',
            btnClass: 'btn-' + type,
            action: function(){ resolve(this.$content.find('.jc-input').val()); }
          }
        }
      });
    });
  }
  return { alert: alert, confirm: confirm, prompt: prompt };
})(jQuery);
