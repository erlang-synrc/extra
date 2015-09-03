(function($) {
  $.fn.upload = function(settings){
    var options = $.extend(true, {
      block_size: 5*1024*1024, //10485760,
      progressClass: "progress-striped",
      preview: false,
      value: "",
      beginUpload: function(){},
      deliverSlice: function(){},
      queryFile: function(){},
      complete: function(){} 
    }, settings);

    return this.filter('input[type="file"]').each(function(){return $.Upload(this, options)});
  };

  $.Upload = function(input, options){
    if (!(window.File && window.FileReader && window.FileList && window.Blob)) return false;

    var $input = $(input);
    var self = this;
    var pid;
    var reader;
    var block_size = options.block_size;
    var cancelled_upload;
    var paused_upload;
    var start_time;
    var file;
    var file_index = 0;
    var start_file_index;

    var browse_btn = $('<a>', {href: '#',title: 'Browse', }).on('click', function(e){$input.trigger('click');e.preventDefault();}).append($('<i>', {class: 'fa fa-upload fa-2x'}));
    var upload_btn = $('<a>', {href: '#',title: 'Upload'  }).on('click', function(e){begin_upload(); e.preventDefault();}).hide().append($('<i>', {class: 'fa fa-play-circle fa-2x'}));
    var reupload_btn=$('<a>', {href: '#',title: 'Reupload'}).on('click', function(e){file_index = 0;begin_upload();e.preventDefault();}).append($('<i>', {class:'fa fa-refresh fa-2x'}));
    var resume_btn = $('<a>', {href: '#',title: 'Resume'  }).on('click', function(e){begin_upload();e.preventDefault();}).append($('<i>', {class:'fa fa-play-circle fa-2x'}));
    var cancel_btn = $('<a>', {href: '#', class: 'text-error', title: 'Cancel'})
      .on('click', function(e) {
        reset_upload();
        progress_label.html('');
        cancelled_upload=true;
        preview.html('');
        e.preventDefault();
    }).append($('<i>', {class: 'fa fa-remove fa-2x'}));
    var pause_btn = $('<a>', {href:'#', class: '', title: 'Pause'})
      .on('click', function (e) {
        paused_upload=true;
        pause_btn.hide();
        resume_btn.show();
        progress_label.html('');
        e.preventDefault();
      }).append($('<i>', {class: 'fa fa-pause fa-lg'}));

    var etainfo = $('<span/>', {class: 'info'});
    var info = $('<span/>', {class: 'info', name: 'info'});
    var progress_bar = $('<div/>', {class:'progress-bar', style: 'width:0;'}).on('progress-changed', function(e, progress){
      progress_bar.css('width', progress + "%");
      if(progress === 48){
        $('i', pause_btn).addClass('fa-light');
        $('i', resume_btn).addClass('fa-light');
      }
      progress_bar.css('width', progress + "%");

    });
    var progress_label = $('<div/>', {class: 'progress-label'});
    var progress_ctl = $('<div/>', {class: 'progress-ctl'}).append(upload_btn, pause_btn, resume_btn, reupload_btn);
    var progress = $('<div/>', {class: 'progress progress-bar-info ' + options.progressClass}).append(progress_bar, progress_label, progress_ctl);
    var ctl  = $('<div/>', {class: 'ctl'}).append(cancel_btn, info, etainfo, browse_btn);
    var preview = $('<div/>', {class: 'preview'});
    $input.wrap("<div class='file_upload' contenteditable='false'></div>").hide().parent().append(preview, progress, ctl);

    if(options.value !== "undefined"){
      preview.html("<img src='"+ options.value +"'/>");
    }
    var file_buttons = $('a', $input.parent());

    $input.on('change', function(e) {
      file = this.files[0];
      if(!file) return;
      info.html('&nbsp;&nbsp;' + file.name+'&nbsp;&nbsp;');
      progress_label.html('');
      file_buttons.hide();
      browse_btn.show();
      upload_btn.show();
      cancel_btn.show();
      progress_bar.css('width', "0");
      if(options.preview=='true' && file.type.match('image*')){
        reader = new FileReader();
        reader.onload = (function(f){
          return function(e){
            preview.html($('<img/>', {src: e.target.result, title: f.name, width: preview.width()}));
          };
        })(file);
        reader.readAsDataURL(file);
      }else {
        preview.html('');
      }
      var type = (file.type === "") ? Bert.atom('undefined') : Bert.binary(file.type);
      options.queryFile(Bert.tuple(Bert.atom('query'),Bert.binary(file.name), type));
    }).on('exist', function(e, fileSize){
      file_index = 0;
      var size = parseInt(fileSize);
      if (size>0) {
        file_index = size;
        file_buttons.hide();
        browse_btn.show();
        reupload_btn.show();
        if (file_index<file.size) {
          resume_btn.show();
          progress_label.html('Upload incomplete');
        } else {
          progress_label.html('File exists');
        }
        update_progress_bar();
      }
    }).on('begin_upload', function(e, pid){
      self.pid = pid;
      read_slice(file_index, block_size);
    }).on('upload', function(e, fileSize){
      var size = parseInt(fileSize);
      if (!paused_upload && !cancelled_upload && file_index<file.size) {
        read_slice(file_index, file_index + block_size);
      }
      if (paused_upload) progress_label.html('');
      if (cancelled_upload) {
        reset_upload();
        progress_label.html('');
      }
    }).on('error', function(e, msg){
      error(msg);
    }).on('reset', function(e){ reset_upload(); });

    function reset_upload(){
      file_buttons.hide();
      browse_btn.show();
      cancelled_upload = false;
      paused_upload = false;
      preview.html('');
      info.html('');
      progress_label.html('');
      progress_bar.css('width', "0");
      $('i', pause_btn).removeClass('fa-light');
      $('i', resume_btn).removeClass('fa-light');
    }

    function error(message){ 
      console.log('error ' + message);
      reset_upload();
      $('<div/>', {class: 'alert alert-error'})
        .append($('<button>', {type: 'button', class: 'close', 'data-dismiss': 'alert'}).html("&times;"))
        .append(message)
        .prependTo($input.parent());
      $('.progress-bar-info', $input.parent()).removeClass('progress-bar-info').addClass('progress-bar-danger');
      progress_bar.css('width', "100%");
      progress_label.html(message);
    }
    function onabort(event){ error('File upload aborted'); reader.abort();}
    function onerror(event){
      switch(event.target.error.code) {
        case event.target.error.NOT_FOUND_ERR:    error('File not found');       break;
        case event.target.error.NOT_READABLE_ERR: error('File is not readable'); break;
        case event.target.error.ABORT_ERR:        error('File upload aborted');  break;
        default: error('An error occurred reading the file.');    };
    }
    function onloadend(event){
      if(event.target.readyState == FileReader.DONE){
        if (options.deliverSlice(Bert.tuple(Bert.atom('upload'), Bert.binary(self.pid), Bert.binary(event.target.result))) == false) {
          error('Error delivering data to server');
          return;
        }
        file_index += block_size;
        calculate_eta();
        update_progress_bar();

        if (file_index>=file.size){
          file_buttons.hide();
          browse_btn.show();
          progress_label.html('Upload complete');
          etainfo.html('');
          options.complete(Bert.tuple(Bert.atom('complete'), Bert.binary(self.pid)));
        }
      }
    }

    function calculate_eta()  {
      var delta_ms = Date.now() - start_time;
      var rate = (file_index- start_file_index) / delta_ms;

      var remaining_ms = (file.size - file_index) / rate;
      if(remaining_ms < 0) return;

      var delta_hr = parseInt(Math.floor(remaining_ms/3600000));
      remaining_ms -= delta_hr*3600000;
      var delta_min = parseInt(Math.floor(remaining_ms/60000));
      remaining_ms -= delta_min*60000;
      var delta_sec = parseInt(Math.floor(remaining_ms/1000));
      var eta = "";
      if (delta_sec>=0) eta = delta_sec + 1 + " secs";
      if (delta_min>0) eta = delta_min + " mins";
      if (delta_hr>0) eta = delta_hr + " hours";
      etainfo.html(eta);
    }
    function update_progress_bar()  {
      var progress = Math.floor(100* (file_index / file.size));
      if(progress_bar[0].style.width !== progress+'%'){
        progress_bar.trigger('progress-changed', [progress]);
      }
    }

    function read_slice(start, end)   {
      reader = new FileReader();
      reader.onabort = onabort;
      reader.onerror = onerror;
      reader.onloadend = onloadend;
      var blob = file.slice(start, end);
      reader.readAsBinaryString(blob);
    }

    function begin_upload()   {
      file_buttons.hide();
      pause_btn.show();
      cancel_btn.show();
      progress_label.html('');
      start_time = Date.now();
      start_file_index = file_index;
      if (paused_upload) paused_upload = false;
      var type = (file.type === "") ? Bert.atom('undefined') : Bert.binary(file.type);
      options.beginUpload(Bert.tuple(Bert.atom('begin_upload'), Bert.binary(file.name), type));
    }

    reset_upload();
    return this;
  };

})(window.jQuery || window.Zepto);
